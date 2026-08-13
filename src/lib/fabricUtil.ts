import { fabric } from 'fabric'
import type {
  Shape,
  ShapeBase,
  LineShape,
  ShapeType,
  Paragraph,
  TextRun,
  Fill,
  Stroke,
  Shadow,
  Hex,
} from '../types'
import { shapePoints, withAlpha, DASHES, normalizeHex, clamp, PT_TO_PX, PX_TO_PT } from './utils'
import type { Align } from '../types'

export interface FabricMeta {
  shapeId: string
  kind: 'shape' | 'text' | 'line' | 'image' | 'bg'
  isShapeText?: boolean
}

// runtime meta accessor (avoids fragile module augmentation)
export const fm = (o: any): FabricMeta | undefined => o?.meta

// ================= geometry =================

export interface Geometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
}

export function readGeometry(obj: fabric.Object): Geometry {
  return {
    x: Math.round(obj.left ?? 0),
    y: Math.round(obj.top ?? 0),
    width: Math.round((obj.width ?? 0) * Math.abs(obj.scaleX ?? 1)),
    height: Math.round((obj.height ?? 0) * Math.abs(obj.scaleY ?? 1)),
    rotation: (((obj.angle ?? 0) % 360) + 360) % 360,
    flipH: !!obj.flipX,
    flipV: !!obj.flipY,
  }
}

export function setGeometry(obj: fabric.Object, g: Partial<Geometry>) {
  const patch: Record<string, unknown> = {}
  if (g.x !== undefined) patch.left = g.x
  if (g.y !== undefined) patch.top = g.y
  if (g.width !== undefined) patch.width = g.width
  if (g.height !== undefined) patch.height = g.height
  patch.scaleX = 1
  patch.scaleY = 1
  if (g.rotation !== undefined) patch.angle = g.rotation
  if (g.flipH !== undefined) patch.flipX = g.flipH
  if (g.flipV !== undefined) patch.flipY = g.flipV
  obj.set(patch as any)
}

// ================= styling =================

export function applyFill(obj: fabric.Object, fill: Fill | undefined) {
  if (!fill || (fill as any).type === 'none') {
    obj.set('fill', 'rgba(0,0,0,0)')
    return
  }
  if (fill.type === 'solid') {
    obj.set('fill', withAlpha(fill.color, fill.transparency ?? 0))
    return
  }
  // gradient
  const stops = fill.stops
    .filter((s) => s && s.color)
    .map((s) => ({
      offset: clamp(s.position, 0, 100) / 100,
      color: withAlpha(s.color, s.transparency ?? 0),
    }))
  if (stops.length < 2) {
    obj.set('fill', stops[0]?.color ?? 'rgba(0,0,0,0)')
    return
  }
  const rad = (fill.angle * Math.PI) / 180
  const x1 = 0.5 + 0.5 * Math.sin(rad)
  const y1 = 0.5 - 0.5 * Math.cos(rad)
  const x2 = 0.5 - 0.5 * Math.sin(rad)
  const y2 = 0.5 + 0.5 * Math.cos(rad)
  try {
    const grad = new fabric.Gradient({
      type: 'linear',
      gradientUnits: 'percentage' as any,
      coords: { x1, y1, x2, y2 },
      colorStops: stops,
    })
    obj.set('fill', grad as any)
  } catch {
    obj.set('fill', stops[0].color)
  }
}

export function applyStroke(obj: fabric.Object, stroke?: Stroke) {
  if (!stroke || stroke.width <= 0) {
    obj.set('stroke', undefined)
    obj.set('strokeWidth', 0)
    obj.set('strokeDashArray', undefined)
    return
  }
  obj.set('stroke', withAlpha(stroke.color, stroke.transparency ?? 0))
  obj.set('strokeWidth', stroke.width)
  const dash = DASHES[stroke.dash ?? 'solid']
  obj.set('strokeDashArray', dash.length ? dash : undefined)
}

export function applyShadow(obj: fabric.Object, shadow?: Shadow) {
  if (!shadow) {
    obj.set('shadow', undefined)
    return
  }
  obj.set(
    'shadow',
    new fabric.Shadow({
      color: withAlpha(shadow.color, (shadow.transparency ?? 0) + 10),
      blur: shadow.blur * 2,
      offsetX: shadow.offsetX * 2,
      offsetY: shadow.offsetY * 2,
    }),
  )
}

export function applyCommon(obj: fabric.Object, s: Shape, kind: FabricMeta['kind'], editable: boolean) {
  ;(obj as any).meta = { shapeId: s.id, kind }
  obj.set('selectable', editable)
  obj.set('evented', editable)
  obj.set('opacity', (s.opacity ?? 100) / 100)
  if (kind !== 'line') {
    setGeometry(obj, {
      x: (s as any).x,
      y: (s as any).y,
      width: (s as any).width,
      height: (s as any).height,
      rotation: (s as any).rotation || 0,
      flipH: (s as any).flipH,
      flipV: (s as any).flipV,
    })
    if ((s as any).locked) {
      obj.set('lockMovementX', true)
      obj.set('lockMovementY', true)
      obj.set('lockRotation', true)
      obj.set('lockScalingX', true)
      obj.set('lockScalingY', true)
    }
  }
}

// ================= text conversion =================
// fabric stores styles as styles[lineIndex][charIndexInLine]

export type FabricStyles = Record<number, Record<number, any>>

interface FabricParagraphLayout {
  align?: Align
  marginLeft: number
  marginRight: number
  firstLineIndent: number
}

function installParagraphLayout(tb: fabric.Textbox, paragraphs: Paragraph[] | undefined) {
  const target = tb as any
  target.__pptxParagraphLayout = (paragraphs ?? []).map((paragraph) => ({
    align: paragraph.align,
    marginLeft: (paragraph.marginLeft ?? 0) * PT_TO_PX,
    marginRight: (paragraph.marginRight ?? 0) * PT_TO_PX,
    firstLineIndent: (paragraph.firstLineIndent ?? 0) * PT_TO_PX,
  } satisfies FabricParagraphLayout))
  if (target.__pptxParagraphLayoutInstalled) return
  target.__pptxParagraphLayoutInstalled = true

  // Fabric supports one alignment and no paragraph indents per Textbox. PPTX
  // text bodies support both per paragraph, so adapt Fabric's wrapping and
  // line-offset hooks while retaining its native editing/cursor behavior.
  target._wrapText = function (lines: string[][], desiredWidth: number) {
    let wrapped: string[][] = []
    this.isWrapping = true
    for (let i = 0; i < lines.length; i++) {
      const layout: FabricParagraphLayout | undefined = this.__pptxParagraphLayout?.[i]
      const available = Math.max(
        1,
        desiredWidth
          - (layout?.marginLeft ?? 0)
          - (layout?.marginRight ?? 0)
          - Math.min(0, layout?.firstLineIndent ?? 0),
      )
      wrapped = wrapped.concat(this._wrapLine(lines[i], i, available))
    }
    this.isWrapping = false
    return wrapped
  }

  target._getLineLeftOffset = function (lineIndex: number) {
    const map = this._styleMap?.[lineIndex]
    const paragraphIndex = map?.line ?? lineIndex
    const layout: FabricParagraphLayout | undefined = this.__pptxParagraphLayout?.[paragraphIndex]
    const firstVisualLine = !map || map.offset === 0
    const left = (layout?.marginLeft ?? 0) + (firstVisualLine ? layout?.firstLineIndent ?? 0 : 0)
    const right = layout?.marginRight ?? 0
    const lineWidth = this.getLineWidth(lineIndex)
    const lineDiff = Math.max(0, this.width - left - right - lineWidth)
    const textAlign = layout?.align ?? this.textAlign
    const isEndOfWrapping = this.isEndOfWrapping(lineIndex)
    let offset = left
    if (textAlign === 'center' || (textAlign === 'justify-center' && isEndOfWrapping)) {
      offset += lineDiff / 2
    } else if (textAlign === 'right' || (textAlign === 'justify-right' && isEndOfWrapping)) {
      offset += lineDiff
    }
    if (this.direction === 'rtl') offset -= lineDiff
    return offset
  }
}

export function paragraphsToFabricText(paragraphs: Paragraph[] | undefined, objectLevel?: Partial<{ align: Align; lineHeight: number; fontScale: number }>): {
  text: string
  styles: FabricStyles
  textAlign?: Align
  lineHeight?: number
} {
  if (!paragraphs?.length) return { text: '', styles: {} }
  const fontScale = objectLevel?.fontScale ?? 1
  const texts: string[] = []
  const styles: FabricStyles = {}
  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p]
    let line = ''
    if (para.bullet) line += `${para.bulletChar ?? '•'} `
    styles[p] = {}
    let charIdx = line.length
    for (const run of para.runs) {
      for (let c = 0; c < run.text.length; c++) {
        const st: any = {
          fontSize: run.size ? run.size * PT_TO_PX * fontScale * (run.super || run.sub ? 0.65 : 1) : undefined,
          fontFamily: run.fontFamily,
          fontWeight: run.bold ? 'bold' : undefined,
          fontStyle: run.italic ? 'italic' : undefined,
          underline: run.underline,
          linethrough: run.strike,
          fill: run.color ? normalizeHex(run.color) : undefined,
          textBackgroundColor: run.highlight,
          charSpacing: run.spacing ? Math.round(run.spacing * 100) : undefined,
          deltaY: run.super
            ? -(run.size ?? 18) * PT_TO_PX * fontScale * 0.35
            : run.sub
              ? (run.size ?? 18) * PT_TO_PX * fontScale * 0.25
              : undefined,
        }
        styles[p][charIdx++] = st
      }
      line += run.text
    }
    texts.push(line)
  }
  const obj: { textAlign?: Align; lineHeight?: number } = {}
  if (objectLevel?.align) obj.textAlign = objectLevel.align
  else if (paragraphs[0]?.align) obj.textAlign = paragraphs[0].align
  if (objectLevel?.lineHeight) obj.lineHeight = objectLevel.lineHeight
  else {
    // Fabric exposes one line-height for the whole textbox. PowerPoint often
    // expresses the same visual rhythm as 1.0 lines plus paragraph spacing for
    // prose and 1.5 lines for bullets. Using the largest requested multiplier
    // keeps later bullet paragraphs from collapsing vertically.
    const repeatedSpacingBefore = paragraphs.filter(
      (paragraph) => (paragraph.spaceBefore ?? 0) > 0 && (paragraph.lineSpacing ?? 1) <= 1.1,
    ).length > 1
    obj.lineHeight = Math.max(1, ...paragraphs.map((paragraph) => {
      const lineSpacing = paragraph.lineSpacing ?? 1
      if (!repeatedSpacingBefore || lineSpacing > 1.1) return lineSpacing
      const fontSize = paragraph.runs[0]?.size ?? 18
      return Math.max(lineSpacing, 1 + (paragraph.spaceBefore ?? 0) / Math.max(1, fontSize))
    }))
  }
  return { text: texts.join('\n'), styles, ...obj }
}

const BULLET_RE = /^\s*([•-])\s?/

export interface FabricStyleLookup {
  getStyleAt?: (line: number, char: number) => any | null
}

// build a style lookup straight from a fabric textbox (and its text)
export function makeTextStyleLookup(tb: fabric.Textbox): FabricStyleLookup {
  const styles: FabricStyles = (tb.styles as FabricStyles) ?? {}
  return {
    getStyleAt: (line, char) => styles[line]?.[char] ?? null,
  }
}

export function fabricTextToParagraphs(
  text: string,
  prev: Paragraph[] | undefined,
  styleLookup?: FabricStyleLookup,
  fontScale = 1,
): Paragraph[] {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const prevPara = prev?.[i]
    let bullet = prevPara?.bullet ?? false
    let bulletChar = prevPara?.bulletChar
    const bulletMatch = line.match(BULLET_RE)
    let styleOffset = 0
    if (bulletMatch && (bullet || bulletMatch[1] === '•')) {
      bullet = true
      bulletChar = bulletMatch[1]
      styleOffset = bulletMatch[0].length
      line = line.replace(BULLET_RE, '')
    }
    const runs: TextRun[] = []
    let cur: TextRun | null = null
    let curSig = ''
    for (let c = 0; c < line.length; c++) {
      const st = styleLookup?.getStyleAt?.(i, c + styleOffset) ?? {}
      const sig = [
        st.fontSize, st.fontWeight, st.fontStyle, st.underline, st.linethrough,
        st.fill, st.textBackgroundColor, st.fontFamily, st.deltaY, st.charSpacing,
      ].join('|')
      if (sig !== curSig || !cur) {
        cur = {
          text: '',
          ...runFromFabricStyle(st, fontScale),
        }
        runs.push(cur)
        curSig = sig
      }
      cur.text += line[c]
    }
    if (runs.length === 0) runs.push({ text: '' })
    return {
      runs,
      align: prevPara?.align,
      bullet,
      bulletChar,
      indentLevel: prevPara?.indentLevel,
      marginLeft: prevPara?.marginLeft,
      marginRight: prevPara?.marginRight,
      firstLineIndent: prevPara?.firstLineIndent,
      lineSpacing: prevPara?.lineSpacing,
      spaceBefore: prevPara?.spaceBefore,
      spaceAfter: prevPara?.spaceAfter,
    }
  })
}

function runFromFabricStyle(st: any, fontScale = 1): Partial<TextRun> {
  const out: Partial<TextRun> = {}
  if (st.fontFamily) out.fontFamily = st.fontFamily
  if (st.fontWeight === 'bold') out.bold = true
  if (st.fontStyle === 'italic') out.italic = true
  if (st.underline) out.underline = true
  if (st.linethrough) out.strike = true
  if (st.fill) out.color = normalizeHex(st.fill)
  if (st.textBackgroundColor) out.highlight = normalizeHex(st.textBackgroundColor)
  if (st.deltaY) {
    const fs = st.fontSize ?? 18
    if (st.deltaY < -fs * 0.1) out.super = true
    else if (st.deltaY > 0) out.sub = true
  }
  if (st.fontSize) out.size = st.fontSize * PX_TO_PT / Math.max(0.01, fontScale) / (out.super || out.sub ? 0.65 : 1)
  if (st.charSpacing) out.spacing = st.charSpacing / 100
  return out
}

// ================= object construction =================

export function makePolygon(ptsUnit: [number, number][], w: number, h: number): fabric.Polygon {
  const sx = w / 1000
  const sy = h / 1000
  return new fabric.Polygon(
    ptsUnit.map(([x, y]) => ({ x: x * sx, y: y * sy })),
    { originX: 'left', originY: 'top', strokeLineJoin: 'round', objectCaching: true },
  )
}

export function createFabricObject(shape: Shape, editable: boolean): fabric.Object | null {
  if (shape.type === 'line') return createLine(shape, editable)
  if (shape.type === 'image') return null // loaded async
  const s = shape as ShapeBase
  let obj: fabric.Object

  if (s.type === 'text') {
    const tb = new fabric.Textbox('', {
      width: s.width,
      originX: 'left',
      originY: 'top',
      fontSize: (s.paragraphs?.[0]?.runs[0]?.size ?? 18) * PT_TO_PX * (s.fontScale ?? 1),
      fontFamily: s.paragraphs?.[0]?.runs[0]?.fontFamily ?? 'Calibri',
      fill: s.paragraphs?.[0]?.runs[0]?.color ?? '#202124',
      padding: 2,
    })
    applyTextContent(tb, s.paragraphs, s)
    tb.set('fill', s.paragraphs?.[0]?.runs[0]?.color ?? '#202124')
    obj = tb
  } else if (s.type === 'rect' || s.type === 'roundRect') {
    const r = Math.min(s.width, s.height) * 0.1667
    obj = new fabric.Rect({
      rx: s.type === 'roundRect' ? r : 0,
      ry: s.type === 'roundRect' ? r : 0,
      originX: 'left',
      originY: 'top',
    })
  } else if (s.type === 'ellipse') {
    obj = new fabric.Ellipse({
      rx: s.width / 2,
      ry: s.height / 2,
      originX: 'left',
      originY: 'top',
      left: s.x + s.width / 2,
      top: s.y + s.height / 2,
    })
    obj.set('originX', 'left')
    obj.set('originY', 'top')
    // fabric Ellipse centers on left/top by default; override to bbox top-left
    obj.set('left', s.x)
    obj.set('top', s.y)
  } else {
    obj = makePolygon(shapePoints(s.type), s.width, s.height)
  }

  applyFill(obj, s.fill)
  applyStroke(obj, s.stroke)
  applyShadow(obj, s.shadow)
  applyCommon(obj, s, s.type === 'text' ? 'text' : 'shape', editable)
  return obj
}

export function applyTextContent(tb: fabric.Textbox, paragraphs: Paragraph[] | undefined, s?: ShapeBase) {
  installParagraphLayout(tb, paragraphs)
  const fontScale = s?.fontScale ?? 1
  const { text, styles, textAlign, lineHeight } = paragraphsToFabricText(paragraphs, { fontScale })
  tb.set('text', text)
  tb.set('styles', styles)
  if (paragraphs?.length) {
    const first = paragraphs[0]
    if (textAlign) tb.set('textAlign', textAlign)
    if (lineHeight) tb.set('lineHeight', lineHeight)
    tb.set('fontFamily', first.runs[0]?.fontFamily ?? 'Calibri')
    tb.set('fontSize', (first.runs[0]?.size ?? 18) * PT_TO_PX * fontScale)
    tb.set('fontWeight', first.runs[0]?.bold ? 'bold' : 'normal')
    tb.set('fontStyle', first.runs[0]?.italic ? 'italic' : 'normal')
    tb.set('fill', first.runs[0]?.color ?? '#202124')
  }
  if (s) {
    applyVerticalAlign(tb, s)
  }
}

export function applyVerticalAlign(tb: fabric.Textbox, s: ShapeBase) {
  // fabric text is top-anchored; emulate with deltaY on lines
  const va = s.verticalAlign || 'top'
  ;(tb as any).__va = va
  if (va === 'top') {
    tb.set('deltaY', 0)
    return
  }
  // measure on next frame after render
  requestAnimationFrame(() => {
    try {
      const linesInfo = (tb as any)._textLinesInfo ?? (tb as any).textLinesInfo
      if (!linesInfo) return
      const h = Array.isArray(linesInfo) ? linesInfo.length : 0
      const textH = h ? h * (tb.lineHeight ?? 1) * ((tb.fontSize as number) || 18) : 0
      const avail = (tb.height ?? 0) * (tb.scaleY || 1) - 4
      const delta = va === 'middle' ? (avail - textH) / 2 : avail - textH
      tb.set('deltaY', Math.max(0, delta))
    } catch {}
  })
}

// ---- lines ----
export function createLine(shape: LineShape, editable: boolean): fabric.Object {
  const { x1, y1, x2, y2 } = shape
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const path = buildLinePath(x1 - left, y1 - top, x2 - left, y2 - top, shape.stroke.width, shape.arrowStart, shape.arrowEnd)
  const obj = new fabric.Path(path, {
    left,
    top,
    originX: 'left',
    originY: 'top',
    fill: 'transparent',
    stroke: withAlpha(shape.stroke.color, shape.stroke.transparency ?? 0),
    strokeWidth: shape.stroke.width,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectCaching: true,
    lockScalingFlip: true,
  })
  if (shape.stroke.dash && shape.stroke.dash !== 'solid') {
    obj.set('strokeDashArray', DASHES[shape.stroke.dash])
  }
  obj.set('opacity', (shape.opacity ?? 100) / 100)
  obj.set('width', Math.abs(x2 - x1))
  obj.set('height', Math.abs(y2 - y1))
  obj.set('scaleX', 1)
  obj.set('scaleY', 1)
  ;(obj as any).meta = { shapeId: shape.id, kind: 'line' }
  obj.set('selectable', editable)
  obj.set('evented', editable)
  return obj
}

function buildLinePath(px1: number, py1: number, px2: number, py2: number, sw: number, arrowStart?: boolean, arrowEnd?: boolean): string {
  const dx = px2 - px1
  const dy = py2 - py1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len
  const uy = dy / len
  const head = sw * 4.2
  const parts: string[] = [`M ${px1} ${py1} L ${px2} ${py2}`]
  const tri = (cx: number, cy: number, dir: number) => {
    const bx = -uy * head * 0.45
    const by = ux * head * 0.45
    const tx = ux * head
    const ty = uy * head
    return `M ${cx + tx * dir} ${cy + ty * dir} L ${cx + bx * dir} ${cy + by * dir} L ${cx - bx * dir} ${cy - by * dir} Z`
  }
  if (arrowEnd) parts.push(tri(px2, py2, 1))
  if (arrowStart) parts.push(tri(px1, py1, -1))
  return parts.join(' ')
}

export function readLineGeo(obj: fabric.Object, prev: LineShape): { x1: number; y1: number; x2: number; y2: number } {
  const g = readGeometry(obj)
  const oldW = Math.abs(prev.x2 - prev.x1) || 1
  const oldH = Math.abs(prev.y2 - prev.y1) || 1
  const midX = (prev.x1 + prev.x2) / 2
  const midY = (prev.y1 + prev.y2) / 2
  const midXs = g.x + g.width / 2
  const midYs = g.y + g.height / 2
  const sfx = g.width / oldW
  const sfy = g.height / oldH
  let x1 = midXs + (prev.x1 - midX) * sfx
  let y1 = midYs + (prev.y1 - midY) * sfy
  let x2 = midXs + (prev.x2 - midX) * sfx
  let y2 = midYs + (prev.y2 - midY) * sfy
  const angle = g.rotation
  if (angle) {
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const rot = (px: number, py: number): [number, number] => {
      const dx = px - midXs
      const dy = py - midYs
      return [midXs + dx * cos - dy * sin, midYs + dx * sin + dy * cos]
    }
    ;[x1, y1] = rot(x1, y1)
    ;[x2, y2] = rot(x2, y2)
    if (g.rotation > 0.5) {
      // fabric returns angle normalized to [0,360]; keep stored rotation consistent
      void 0
    }
  }
  return { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) }
}

// ---- shape-text overlay (caption for shapes that carry text) ----
export function shapeTextOverlay(s: ShapeBase, editable: boolean): fabric.Textbox | null {
  if (!s.paragraphs?.some((p) => p.runs.length) && s.type === 'text') return null
  if (s.type === 'text') return null // plain text boxes are their own object
  if (!s.paragraphs?.length) return null
  const tb = new fabric.Textbox('', {
    left: s.x,
    top: s.y,
    width: s.width,
    originX: 'left',
    originY: 'top',
    fontSize: (s.paragraphs[0].runs[0]?.size ?? 18) * PT_TO_PX * (s.fontScale ?? 1),
    fontFamily: s.paragraphs[0].runs[0]?.fontFamily ?? 'Calibri',
    fill: s.paragraphs[0].runs[0]?.color ?? '#202124',
    padding: 0,
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
  })
  applyTextContent(tb, s.paragraphs, s)
  setShapeTextGeometry(tb, s)
  ;(tb as any).meta = { shapeId: s.id, kind: 'shape', isShapeText: true }
  tb.set('opacity', (s.opacity ?? 100) / 100)
  return tb
}

export function setShapeTextGeometry(
  tb: fabric.Textbox,
  s: ShapeBase,
  outer: Partial<Geometry> = {},
) {
  const x = outer.x ?? s.x
  const y = outer.y ?? s.y
  const width = outer.width ?? s.width
  const height = outer.height ?? s.height
  const inset = s.inset
    ? {
        left: s.inset.left * PT_TO_PX,
        right: s.inset.right * PT_TO_PX,
        top: s.inset.top * PT_TO_PX,
        bottom: s.inset.bottom * PT_TO_PX,
      }
    : { left: 4, right: 4, top: 4, bottom: 4 }
  const innerWidth = Math.max(1, width - inset.left - inset.right)
  const innerHeight = Math.max(1, height - inset.top - inset.bottom)
  tb.set({ width: innerWidth, scaleX: 1, scaleY: 1 })
  ;(tb as any).initDimensions?.()
  const textHeight = Math.min(innerHeight, tb.calcTextHeight())
  const verticalOffset = s.verticalAlign === 'bottom'
    ? innerHeight - textHeight
    : s.verticalAlign === 'middle'
      ? (innerHeight - textHeight) / 2
      : 0
  tb.set({
    left: x + inset.left,
    top: y + inset.top + Math.max(0, verticalOffset),
    width: innerWidth,
    height: textHeight,
    angle: outer.rotation ?? s.rotation ?? 0,
    flipX: outer.flipH ?? s.flipH,
    flipY: outer.flipV ?? s.flipV,
  })
  tb.setCoords()
}

export function metaIdOf(obj: fabric.Object | undefined | null): string | null {
  if (!obj) return null
  return fm(obj)?.shapeId ?? null
}

// ---- text selection styling (applies while a textbox is being edited) ----
export function applyTextSelectionStyle(canvas: fabric.Canvas | null, style: Record<string, any>): boolean {
  const obj = canvas?.getActiveObject() as fabric.Textbox | undefined
  if (!obj || !obj.isEditing) return false
  obj.setSelectionStyles(style as any)
  canvas!.requestRenderAll()
  return true
}

export function hasTextEditingSelection(canvas: fabric.Canvas | null): boolean {
  const obj = canvas?.getActiveObject() as fabric.Textbox | undefined
  return !!(obj && obj.isEditing)
}

export function resolveHex(c: string | undefined, fallback: Hex): Hex {
  return normalizeHex(c, fallback)
}
