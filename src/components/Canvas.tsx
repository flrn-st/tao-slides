import { useEffect, useRef } from 'react'
import { fabric } from 'fabric'
import { useEditor, currentSlide } from '../store'
import type { Deck, ImageShape, Shape, ShapeBase, Slide } from '../types'
import {
  createFabricObject,
  shapeTextOverlay,
  readGeometry,
  readLineGeo,
  fabricTextToParagraphs,
  makeTextStyleLookup,
  setGeometry,
  setShapeTextGeometry,
  applyCommon,
  applyFill,
  applyStroke,
  applyShadow,
  metaIdOf,
} from '../lib/fabricUtil'
import { buildSlideBg } from '../lib/render'
import { fm } from '../lib/fabricUtil'
import { uid } from '../lib/utils'

let sharedCanvas: fabric.Canvas | null = null
export function getEditorCanvas(): fabric.Canvas | null {
  return sharedCanvas
}

interface CanvasProps {
  containerRef: React.RefObject<HTMLDivElement>
}

function sigOf(shape: Shape): string {
  return JSON.stringify(shape)
}

export default function Canvas({ containerRef }: CanvasProps) {
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const gestureIds = useRef<Set<string>>(new Set())
  const editingId = useRef<string | null>(null)
  const sigCache = useRef<Map<string, string>>(new Map())
  const applyingSelection = useRef(false)
  const lastStoreSelection = useRef<string[]>([])
  const textChangedTimer = useRef<number | null>(null)
  const liveTimer = useRef<number | null>(null)
  const livePatches = useRef<Record<string, Partial<Shape>>>({})

  const deck = useEditor((s) => s.deck)
  const zoom = useEditor((s) => s.zoom)
  const showGuides = useEditor((s) => s.showGuides)
  const selectedShapeIds = useEditor((s) => s.selectedShapeIds)
  const slide = useEditor(currentSlide)
  const selectedSlideId = useEditor((s) => s.selectedSlideId)

  // ---------- init ----------
  useEffect(() => {
    const c = new fabric.Canvas(containerRef.current!.querySelector('canvas') as HTMLCanvasElement, {
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      backgroundColor: 'transparent',
    })
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#eb6c36'
    const accentSubtle = getComputedStyle(document.documentElement).getPropertyValue('--accent-subtle').trim() || 'rgba(235, 108, 54, 0.14)'
    c.selectionColor = accentSubtle
    c.selectionBorderColor = accent
    c.selectionLineWidth = 1
    canvasRef.current = c
    sharedCanvas = c
    if (import.meta.env.DEV) {
      ;(window as any).__editorCanvas = c
    }

    const syncSelection = () => {
      if (applyingSelection.current) return
      const ids = c
        .getActiveObjects()
        .map((o) => metaIdOf(o))
        .filter((id): id is string => !!id)
      // collapse caption/text of same shape to the parent id
      const unique = Array.from(new Set(ids))
      if (JSON.stringify(unique) !== JSON.stringify(lastStoreSelection.current)) {
        useEditor.getState().selectShapes(unique)
      }
    }
    c.on('selection:created', syncSelection)
    c.on('selection:updated', syncSelection)

    c.on('object:modified', () => {
      gestureIds.current.clear()
      commitActiveGeometry()
    })

    const liveCommit = () => {
      if (liveTimer.current) {
        clearTimeout(liveTimer.current)
        liveTimer.current = null
      }
      const patches = livePatches.current
      livePatches.current = {}
      if (Object.keys(patches).length) {
        useEditor.getState().commitPatches(patches, true)
      }
    }

    const syncCaptionTransform = (target?: fabric.Object) => {
      if (!target) return
      const meta = fm(target)
      if (!meta || meta.isShapeText || meta.kind !== 'shape') return
      const caption = c.getObjects().find((o) => {
        const m = fm(o)
        return m?.shapeId === meta.shapeId && !!m.isShapeText
      })
      if (!caption) return
      const shape = getShape(meta.shapeId)
      if (shape && 'x' in shape && shape.type !== 'text') {
        setShapeTextGeometry(caption as fabric.Textbox, shape as ShapeBase, readGeometry(target))
      } else {
        setGeometry(caption, readGeometry(target))
        caption.setCoords()
      }
    }

    const startGesture = (o?: fabric.Object) => {
      if (!o) return
      const id = metaIdOf(o)
      if (id) gestureIds.current.add(id)
      // refresh live patches immediately
      liveCommit()
    }

    c.on('object:moving', (e) => {
      startGesture(e.target)
      syncCaptionTransform(e.target)
      liveCommit()
    })
    c.on('object:scaling', (e) => {
      startGesture(e.target)
      syncCaptionTransform(e.target)
      const o = e.target
      if (fm(o)?.kind === 'shape' || fm(o)?.kind === 'text') {
        patchShapeSpecifics(o as any)
      }
      liveCommit()
    })
    c.on('object:rotating', (e) => {
      startGesture(e.target)
      syncCaptionTransform(e.target)
      liveCommit()
    })

    c.on('mouse:dblclick', (e) => {
      const target = e.target
      const meta = fm(target)
      if (!target || !meta || meta.isShapeText || meta.kind !== 'shape') return
      const shape = getShape(meta.shapeId)
      if (!shape || !('paragraphs' in shape) || !(shape as ShapeBase).paragraphs?.length) return
      const caption = c.getObjects().find((o) => {
        const m = fm(o)
        return m?.shapeId === meta.shapeId && !!m.isShapeText
      }) as fabric.Textbox | undefined
      if (!caption) return
      // Setting the caption active emits a selection event. Treat it as the
      // same logical shape selection so the store-to-canvas selection effect
      // does not immediately switch focus back to the box and cancel editing.
      lastStoreSelection.current = [meta.shapeId]
      caption.set({ selectable: true, evented: true })
      c.setActiveObject(caption)
      caption.enterEditing()
      caption.selectAll()
      editingId.current = meta.shapeId
      c.requestRenderAll()
    })

    c.on('text:editing:entered', (e) => {
      const id = fm(e.target)?.shapeId ?? null
      editingId.current = id
    })

    c.on('text:changed', (e) => {
      const id = fm(e.target)?.shapeId
      if (!id) return
      const prev = getShape(id)
      if (!prev) return
      const textbox = e.target as fabric.Textbox
      const paragraphs = fabricTextToParagraphs(
        textbox.text ?? '',
        'paragraphs' in prev ? (prev as ShapeBase).paragraphs : undefined,
        makeTextStyleLookup(textbox),
        'fontScale' in prev ? (prev as ShapeBase).fontScale ?? 1 : 1,
      )
      if (textChangedTimer.current) clearTimeout(textChangedTimer.current)
      textChangedTimer.current = window.setTimeout(() => {
        useEditor.getState().updateParagraphs(id, paragraphs, true)
      }, 150)
    })

    c.on('text:editing:exited', (e) => {
      const id = fm(e.target)?.shapeId
      editingId.current = null
      if (!id) return
      const prev = getShape(id)
      if (!prev) return
      const textbox = e.target as fabric.Textbox
      const paragraphs = fabricTextToParagraphs(
        textbox.text ?? '',
        'paragraphs' in prev ? (prev as ShapeBase).paragraphs : undefined,
        makeTextStyleLookup(textbox),
        'fontScale' in prev ? (prev as ShapeBase).fontScale ?? 1 : 1,
      )
      if (fm(textbox)?.isShapeText) textbox.set({ selectable: false, evented: false })
      useEditor.getState().updateParagraphs(id, paragraphs, false)
    })

    return () => {
      if (textChangedTimer.current) clearTimeout(textChangedTimer.current)
      c.dispose()
      if (sharedCanvas === c) sharedCanvas = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getShape = (id: string): Shape | null => {
    const st = useEditor.getState()
    for (const s of st.deck.slides) {
      const sh = s.shapes.find((x) => x.id === id)
      if (sh) return sh
    }
    return null
  }

  const commitActiveGeometry = () => {
    const c = canvasRef.current
    if (!c) return
    const patches: Record<string, Partial<Shape>> = {}
    for (const o of c.getActiveObjects()) {
      const id = metaIdOf(o)
      if (!id) continue
      const prev = getShape(id)
      if (!prev) continue
      if ((fm(o) as any)?.kind === 'line') {
        patches[id] = readLineGeo(o, prev as any)
      } else {
        const g = readGeometry(o)
        // for textboxes, height is dynamic
        patches[id] = {
          x: g.x,
          y: g.y,
          width: Math.max(1, g.width),
          height: Math.max(1, g.height),
          rotation: g.rotation,
          flipH: g.flipH,
          flipV: g.flipV,
        }
      }
    }
    if (Object.keys(patches).length) useEditor.getState().commitPatches(patches, false)
  }

  const patchShapeSpecifics = (o: fabric.Object) => {
    const id = metaIdOf(o)
    if (!id) return
    const prev = getShape(id)
    if (!prev) return
    const g = readGeometry(o)
    livePatches.current[id] = {
      ...(livePatches.current[id] ?? {}),
      x: g.x,
      y: g.y,
      width: Math.max(1, g.width),
      height: Math.max(1, g.height),
      rotation: g.rotation,
    }
  }

  // ---------- slide switch: full render ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const s = slide
    if (!s) return
    // full re-render when slide changes
    let cancelled = false
    c.discardActiveObject()
    c.requestRenderAll()
    renderSlideInto(c, deck, s, () => {
      if (!cancelled) c.requestRenderAll()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlideId])

  // ---------- reconcile shapes ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const s = slide
    if (!s) return
    reconcile(c, deck, s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, slide])

  // ---------- zoom ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const vpt = c.viewportTransform!
    const z = zoom / 100
    const cx = c.getWidth() / 2
    const cy = c.getHeight() / 2
    const mx = (cx - vpt[4]) / (vpt[0] || 1)
    const my = (cy - vpt[5]) / (vpt[3] || 1)
    vpt[0] = z
    vpt[3] = z
    vpt[4] = cx - mx * z
    vpt[5] = cy - my * z
    c.setViewportTransform(vpt)
    c.requestRenderAll()
  }, [zoom])

  // ---------- canvas sizing ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const w = deck.slideWidth * (zoom / 100)
    const h = deck.slideHeight * (zoom / 100)
    c.setDimensions({ width: w, height: h })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.slideWidth, deck.slideHeight, zoom])

  // ---------- selection from store ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ids = new Set(selectedShapeIds)
    lastStoreSelection.current = selectedShapeIds
    applyingSelection.current = true
    // A shape carrying text is rendered as a main object plus a non-interactive
    // caption overlay. Selecting both creates an ActiveSelection, which converts
    // their coordinates to group-relative values and can make them disappear
    // during reconciliation. Only the main visual object is selectable.
    const objs = c.getObjects().filter((o) => {
      const meta = fm(o)
      return !!meta && ids.has(meta.shapeId) && meta.kind !== 'bg' && !meta.isShapeText
    })
    if (objs.length === 0) {
      c.discardActiveObject()
    } else if (objs.length === 1) {
      c.setActiveObject(objs[0])
    } else {
      c.setActiveObject(new fabric.ActiveSelection(objs, { canvas: c }))
    }
    applyingSelection.current = false
    c.requestRenderAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeIds])

  // ---------- global keyboard ----------
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const st = useEditor.getState()
      if (st.modal || st.present) return
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const c = canvasRef.current
      const editing = c?.getActiveObject() && (c.getActiveObject() as any).isEditing
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        st.copySelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        st.paste()
        return
      }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        st.copySelected()
        st.deleteSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        st.duplicateSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        const slide = currentSlide(st)
        if (slide && !editing) {
          e.preventDefault()
          st.selectShapes(slide.shapes.map((s) => s.id))
        }
        return
      }
      if (editing) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        st.deleteSelected()
        return
      }
      if (e.key === 'Escape') {
        c?.discardActiveObject()
        st.selectShapes([])
        return
      }
      const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      if (arrows.includes(e.key) && st.selectedShapeIds.length && c) {
        e.preventDefault()
        const delta = e.shiftKey ? 10 : 1
        const patches: Record<string, Partial<Shape>> = {}
        for (const id of st.selectedShapeIds) {
          const sh = getShape(id)
          if (!sh || !('x' in sh)) continue
          if (e.key === 'ArrowUp') patches[id] = { y: sh.y - delta }
          if (e.key === 'ArrowDown') patches[id] = { y: sh.y + delta }
          if (e.key === 'ArrowLeft') patches[id] = { x: sh.x - delta }
          if (e.key === 'ArrowRight') patches[id] = { x: sh.x + delta }
        }
        useEditor.getState().commitPatches(patches, false)
      }
    }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- render helpers ----------

  const renderSlideInto = (c: fabric.Canvas, deck: Deck, slide: Slide, onReady: () => void) => {
    c.clear()
    sigCache.current.clear()
    const size = { w: deck.slideWidth, h: deck.slideHeight }
    const bg = buildSlideBg(slide, size.w, size.h)
    c.add(bg)
    for (const sh of slide.shapes) {
      const objs = buildObjects(sh, true)
      for (const o of objs) c.add(o)
    }
    loadImages(c, slide)
    onReady()
  }

  const buildObjects = (sh: Shape, editable: boolean): fabric.Object[] => {
    const objs: fabric.Object[] = []
    const main = createFabricObject(sh, editable)
    if (main) objs.push(main)
    if (sh.type !== 'text' && sh.type !== 'image' && sh.type !== 'line' && (sh as ShapeBase).paragraphs?.length) {
      const caption = shapeTextOverlay(sh as ShapeBase, editable)
      if (caption) objs.push(caption)
    }
    sigCache.current.set(sh.id, sigOf(sh))
    for (const o of objs) {
      if (main && o !== main) (o as any)._sig = sigOf(sh)
      if (o === main) (o as any)._sig = sigOf(sh)
    }
    return objs
  }

  const loadImages = (c: fabric.Canvas, slide: Slide) => {
    for (const sh of slide.shapes) {
      if (sh.type !== 'image') continue
      const s = sh as ImageShape
      fabric.Image.fromURL(
        s.src,
        (img) => {
          if (!img) return
          ;(img as any).meta = { shapeId: s.id, kind: 'image' }
          img.set('selectable', true)
          img.set('evented', true)
          img.set('originX', 'left')
          img.set('originY', 'top')
          img.set('left', s.x)
          img.set('top', s.y)
          img.set('scaleX', s.width / (s.naturalWidth || img.width || 1))
          img.set('scaleY', s.height / (s.naturalHeight || img.height || 1))
          img.set('angle', s.rotation || 0)
          img.set('flipX', !!s.flipH)
          img.set('flipY', !!s.flipV)
          img.set('opacity', (s.opacity ?? 100) / 100)
          applyShadow(img, s.shadow)
          if (s.locked) {
            img.set('lockMovementX', true)
            img.set('lockMovementY', true)
            img.set('lockRotation', true)
            img.set('lockScalingX', true)
            img.set('lockScalingY', true)
          }
          c.add(img)
          img.setCoords()
          ensureOrder(c, slide)
          c.requestRenderAll()
        },
        { crossOrigin: 'anonymous' },
      )
    }
  }

  const ensureOrder = (c: fabric.Canvas, slide: Slide) => {
    const order = new Map<string, number>()
    slide.shapes.forEach((s, i) => order.set(s.id, i))
    const idx = (o: fabric.Object): number => {
      const id = fm(o)?.shapeId
      if (id === '__bg__' || !id) return -1
      return order.has(id) ? order.get(id)! * 16 : 9999
    }
    c.getObjects().sort((a, b) => idx(a) - idx(b))
  }

  const reconcile = (c: fabric.Canvas, deck: Deck, slide: Slide) => {
    // background
    const bgObjs = c.getObjects().filter((o) => fm(o)?.kind === 'bg')
    for (const b of bgObjs) c.remove(b)
    const bg = buildSlideBg(slide, deck.slideWidth, deck.slideHeight)
    c.add(bg)
    c.sendToBack(bg)

    const wantedIds = new Set(slide.shapes.map((s) => s.id))
    const existing = c.getObjects().filter((o) => fm(o) && fm(o)!.kind !== 'bg')
    const byId = new Map<string, fabric.Object[]>()
    for (const o of existing) {
      const id = fm(o)!.shapeId
      if (!byId.has(id)) byId.set(id, [])
      byId.get(id)!.push(o)
    }

    // remove stale
    for (const [id, objs] of byId) {
      if (!wantedIds.has(id) && !gestureIds.current.has(id) && editingId.current !== id) {
        for (const o of objs) c.remove(o)
      }
    }

    // create/update
    let index = 1 // after bg
    for (const sh of slide.shapes) {
      const cur = byId.get(sh.id)
      const sig = sigOf(sh)
      const cached = sigCache.current.get(sh.id)
      const changed = cached !== sig
      if (!cur || cur.length === 0) {
        // create
        const objs = buildObjects(sh, true)
        for (const o of objs) {
          c.insertAt(o, index, false)
          index++
        }
      } else if (changed && !gestureIds.current.has(sh.id) && editingId.current !== sh.id) {
        // replace
        if (sh.type === 'image') {
          updateImageInPlace(cur[0] as fabric.Image, sh as ImageShape)
          sigCache.current.set(sh.id, sig)
          index += cur.length
        } else {
          for (const o of cur) c.remove(o)
          const objs = buildObjects(sh, true)
          for (const o of objs) {
            c.insertAt(o, index, false)
            index++
          }
        }
      } else {
        // geometry update if only position changed (cheap)
        if (!gestureIds.current.has(sh.id)) {
          for (const o of cur) {
            if (fm(o)?.kind === 'line') continue
            if (fm(o)?.kind === 'image') {
              updateImageInPlace(o as fabric.Image, sh as ImageShape)
            } else if (fm(o)?.kind === 'shape' || fm(o)?.kind === 'text') {
              const sb = sh as ShapeBase
              const g = {
                x: sb.x,
                y: sb.y,
                width: sb.width,
                height: sb.height,
                rotation: sb.rotation || 0,
                flipH: !!sb.flipH,
                flipV: !!sb.flipV,
              }
              if (fm(o)?.isShapeText) {
                // Captions use the text area's insets and vertical alignment;
                // applying the outer box geometry here would snap the caption
                // back to the shape's top-left on every store reconciliation.
                setShapeTextGeometry(o as fabric.Textbox, sb, g)
              } else {
                setGeometry(o, g)
              }
            }
          }
        }
        index += cur.length
        sigCache.current.set(sh.id, sig)
      }
    }

    // captions: rebuild when paragraphs text changed but sig path rebuilt already
    ensureOrder(c, slide)
    c.requestRenderAll()
  }

  const updateImageInPlace = (img: fabric.Image, s: ImageShape) => {
    img.set('left', s.x)
    img.set('top', s.y)
    img.set('scaleX', s.width / (s.naturalWidth || img.width || 1))
    img.set('scaleY', s.height / (s.naturalHeight || img.height || 1))
    img.set('angle', s.rotation || 0)
    img.set('flipX', !!s.flipH)
    img.set('flipY', !!s.flipV)
    img.set('opacity', (s.opacity ?? 100) / 100)
    applyShadow(img, s.shadow)
    img.setCoords()
  }

  // ---------- layout ----------
  const w = deck.slideWidth * (zoom / 100)
  const h = deck.slideHeight * (zoom / 100)

  return (
    <div className="canvas-stage">
      <div className="canvas-outer">
        <div
          className={'slide-frame' + (showGuides ? ' with-grid' : '')}
          style={{ width: w, height: h }}
        >
          <canvas />
        </div>
      </div>
    </div>
  )
}
