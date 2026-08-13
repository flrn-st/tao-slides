import { fabric } from 'fabric'
import type { Deck, Slide, Shape } from '../types'
import {
  createFabricObject,
  shapeTextOverlay,
  applyFill,
  readGeometry,
} from './fabricUtil'
import { withAlpha, clamp } from './utils'

export interface RenderOpts {
  interactive: boolean
  scale: number
  onReady?: () => void
}

let pendingImages = 0

function imageForShape(shape: Shape, interactive: boolean, onDone?: () => void): Promise<fabric.Image> {
  const s = shape as unknown as import('../types').ImageShape
  return new Promise((resolve) => {
    pendingImages++
    fabric.Image.fromURL(
      s.src,
      (img) => {
        pendingImages--
        if (!img) return resolve(undefined as any)
        img.set({
          left: s.x,
          top: s.y,
          scaleX: s.width / (s.naturalWidth || img.width || 1),
          scaleY: s.height / (s.naturalHeight || img.height || 1),
          angle: s.rotation || 0,
          flipX: s.flipH,
          flipY: s.flipV,
          opacity: (s.opacity ?? 100) / 100,
          selectable: interactive,
          evented: interactive,
        })
        ;(img as any).meta = { shapeId: s.id, kind: 'image' }
        if (s.locked) {
          img.set('lockMovementX', true)
          img.set('lockMovementY', true)
          img.set('lockRotation', true)
          img.set('lockScalingX', true)
          img.set('lockScalingY', true)
        }
        img.setCoords()
        onDone?.()
        resolve(img)
      },
      { crossOrigin: 'anonymous' },
    )
  })
}

export function buildSlideBg(slide: Slide, w: number, h: number): fabric.Object {
  const bg = slide.background ?? { type: 'solid', color: '#ffffff' }
  const mk = (fill?: any) => {
    const r = new fabric.Rect({ left: 0, top: 0, width: w, height: h, selectable: false, evented: false, originX: 'left', originY: 'top' })
    ;(r as any).meta = { shapeId: '__bg__', kind: 'bg' }
    r.set('hoverCursor', 'default')
    return r
  }
  const rect = mk()
  if (bg.type === 'none') {
    rect.set('fill', '#ffffff')
  } else if (bg.type === 'solid') {
    rect.set('fill', withAlpha(bg.color, bg.transparency ?? 0))
  } else if (bg.type === 'gradient') {
    applyFill(rect, bg)
  } else {
    // image background: stretch to slide
    const stub = new fabric.Rect({ left: 0, top: 0, width: w, height: h, selectable: false, evented: false, opacity: 1 - (bg.transparency ?? 0) / 100 })
    ;(stub as any).meta = { shapeId: '__bg__', kind: 'bg' }
    const img = new Image()
    img.onload = () => {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      const src = new fabric.Image(img, { selectable: false, evented: false, left: 0, top: 0 })
      src.set('scaleX', (bg.stretch ? w : img.naturalWidth * scale) / img.naturalWidth)
      src.set('scaleY', (bg.stretch ? h : img.naturalHeight * scale) / img.naturalHeight)
      src.set('left', bg.stretch ? 0 : (w - img.naturalWidth * scale) / 2)
      src.set('top', bg.stretch ? 0 : (h - img.naturalHeight * scale) / 2)
      src.set('opacity', 1 - (bg.transparency ?? 0) / 100)
      ;(src as any).meta = { shapeId: '__bg__', kind: 'bg' }
      stub.set('fill', (src as any).fill ?? 'transparent')
      stub.set('opacity', 0)
      if (stub.canvas) {
        stub.canvas.add(src)
        stub.canvas.sendToBack(src)
        stub.canvas.requestRenderAll?.()
      }
    }
    img.src = bg.src
    return stub
  }
  if (rect.canvas) {
    rect.canvas.sendToBack(rect)
    rect.canvas.requestRenderAll?.()
  }
  return rect
}

export function renderSlideToCanvas(canvas: fabric.Canvas, deck: Deck, slide: Slide, opts: RenderOpts): () => void {
  const { interactive, scale, onReady } = opts
  let cancelled = false
  let readyTimer: ReturnType<typeof setTimeout> | undefined
  canvas.clear()
  canvas.setDimensions({ width: deck.slideWidth * scale, height: deck.slideHeight * scale })
  canvas.setViewportTransform([scale, 0, 0, scale, 0, 0])
  canvas.backgroundColor = '#ffffff'

  const objs: fabric.Object[] = []
  // background
  const bgObj = buildSlideBg(slide, deck.slideWidth, deck.slideHeight)
  if (bgObj) objs.push(bgObj)
  else {
    const r = new fabric.Rect({ left: 0, top: 0, width: deck.slideWidth, height: deck.slideHeight, fill: '#ffffff', selectable: false, evented: false })
    ;(r as any).meta = { shapeId: '__bg__', kind: 'bg' }
    objs.push(r)
  }

  let done = false
  const ready = () => {
    if (done || cancelled) return
    done = true
    onReady?.()
  }

  const shapeObjs = slide.shapes.map((s) => {
    const objsForShape: fabric.Object[] = []
    const main = createFabricObject(s, interactive)
    if (main) objsForShape.push(main)
    if (interactive === false && s.type !== 'text' && s.type !== 'image' && s.type !== 'line' && (s as any).paragraphs?.length) {
      const cap = shapeTextOverlay(s as any, false)
      if (cap) objsForShape.push(cap)
    }
    return { s, objs: objsForShape }
  })

  const visibleObjs = shapeObjs.flatMap(({ objs }) => objs)
  for (const o of objs) canvas.add(o)
  for (const o of visibleObjs) canvas.add(o)
  for (const o of visibleObjs) o.setCoords()

  // load images async
  for (const { s } of shapeObjs) {
    if (s.type === 'image') {
      imageForShape(s, interactive, ready).then((img) => {
        if (!img || cancelled) return
        // replace stub: already added as nothing (createFabricObject returns null for images)
        canvas.add(img)
        img.setCoords()
        canvas.requestRenderAll?.()
      })
    }
  }

  if (!deck.slides.some((sl) => sl.shapes.some((sh) => sh.type === 'image'))) {
    ready()
  } else {
    // wait a bit for images to settle
    readyTimer = setTimeout(ready, 250)
  }
  canvas.requestRenderAll?.()
  void readGeometry
  void clamp
  return () => {
    cancelled = true
    if (readyTimer) clearTimeout(readyTimer)
  }
}
