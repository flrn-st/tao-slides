// ---- Core data model for a presentation deck ----

export type Pt = number // points for fonts
export type Hex = string // "#RRGGBB"

export interface SolidFill {
  type: 'solid'
  color: Hex
  transparency?: number // 0-100, 0 = opaque
}
export interface GradientStop {
  color: Hex
  transparency?: number
  position: number // 0-100
}
export interface GradientFill {
  type: 'gradient'
  angle: number // degrees, 0 = up->down in PPT convention
  stops: GradientStop[]
}
export type Fill = SolidFill | GradientFill

export type DashType = 'solid' | 'dash' | 'dot' | 'dashDot'

export interface Stroke {
  color: Hex
  width: number
  dash?: DashType
  transparency?: number
}

export interface Shadow {
  color: Hex
  transparency?: number // 0-100
  blur: number // pt
  offsetX: number // pt
  offsetY: number // pt
  angle?: number // ppt shadows use angle+dist; we store offsets
}

export type Align = 'left' | 'center' | 'right' | 'justify'
export type VAlign = 'top' | 'middle' | 'bottom'

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: Hex
  highlight?: Hex
  size?: Pt
  fontFamily?: string
  super?: boolean
  sub?: boolean
  spacing?: number // letter spacing in pt
}

export interface Paragraph {
  runs: TextRun[]
  align?: Align
  bullet?: boolean
  bulletChar?: string
  indentLevel?: number
  marginLeft?: Pt
  marginRight?: Pt
  firstLineIndent?: Pt
  lineSpacing?: number // multiplier (e.g. 1.5); undefined = single
  spaceBefore?: Pt
  spaceAfter?: Pt
}

export type VAlignShape = VAlign

export type ShapeType =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rightTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'chevron'
  | 'parallelogram'
  | 'trapezoid'
  | 'ltArrow'
  | 'rtArrow'
  | 'upArrow'
  | 'dnArrow'
  | 'star5'
  | 'heart'
  | 'cloud'
  | 'text'

export interface ShapeBase {
  id: string
  type: ShapeType
  name?: string
  x: number
  y: number
  width: number
  height: number
  rotation: number // degrees
  flipH?: boolean
  flipV?: boolean
  opacity: number // 0-100
  locked?: boolean
  fill?: Fill
  stroke?: Stroke
  shadow?: Shadow
  link?: string
  placeholder?: 'title' | 'subtitle' | 'body' | 'pic'
  // text content embedded in a shape (all shapes can carry text)
  paragraphs?: Paragraph[]
  verticalAlign?: VAlignShape
  inset?: { left: number; right: number; top: number; bottom: number } // points
  autoFit?: 'none' | 'shrink' | 'resize'
  fontScale?: number // OOXML normAutofit fontScale, 0-1
  lineSpacingReduction?: number // OOXML normAutofit lnSpcReduction, 0-1
  wordWrap?: boolean
}

export interface TextShape extends ShapeBase {
  type: 'text'
}

export interface LineShape {
  id: string
  type: 'line'
  name?: string
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: Stroke
  arrowStart?: boolean
  arrowEnd?: boolean
  opacity: number
  rotation?: number
  dash?: DashType
}

export interface ImageShape {
  id: string
  type: 'image'
  name?: string
  src: string // data URL
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH?: boolean
  flipV?: boolean
  opacity: number
  locked?: boolean
  shadow?: Shadow
  link?: string
  naturalWidth?: number
  naturalHeight?: number
}

export type Shape = ShapeBase | LineShape | ImageShape

export function isShapeBase(s: Shape): s is ShapeBase {
  return String((s as { type?: unknown }).type) !== 'line' && String((s as { type?: unknown }).type) !== 'image'
}
export function hasText(s: Shape): s is ShapeBase {
  return isShapeBase(s) && !String((s as { type?: unknown }).type).startsWith('image')
}

// ---- Slide / deck ----

export type Background =
  | { type: 'none' }
  | SolidFill
  | GradientFill
  | { type: 'image'; src: string; stretch: boolean; transparency?: number }

export type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'flip'

export interface Slide {
  id: string
  background?: Background
  shapes: Shape[]
  notes: string
  layout?: string // named layout from BUILTIN_LAYOUTS
  transition?: { type: TransitionType; duration: number } // ms
}

export interface Theme {
  majorFont?: string
  minorFont?: string
  colors: Record<string, Hex>
}

export interface Deck {
  title: string
  slideWidth: number
  slideHeight: number
  slides: Slide[]
  theme?: Theme
  embeddedFonts?: EmbeddedFont[]
}

export interface EmbeddedFont {
  fontFamily: string
  regular?: string // base64-encoded original .fntdata payload
  bold?: string
  italic?: string
  boldItalic?: string
}

export type ZoomLevel = number

export interface CurrentFormat {
  fontFamily?: string
  size?: Pt
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: Hex
  highlight?: Hex
  bullet?: boolean
  align?: Align
  lineSpacing?: number
  superscript?: boolean
  subscript?: boolean
}

export interface ModalState {
  kind: 'slideSize' | 'insertImage' | null
}
