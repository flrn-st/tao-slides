import type {
  Deck,
  Paragraph,
  Shape,
  ShapeBase,
  ShapeType,
  Slide,
  TextRun,
  Hex,
} from '../types'
import { uid } from './utils'

export const THEME_COLORS: { name: string; hex: Hex }[] = [
  { name: 'Mercury', hex: '#1a73e8' },
  { name: 'Blue', hex: '#0070f3' },
  { name: 'Teal', hex: '#00838f' },
  { name: 'Green', hex: '#34a853' },
  { name: 'Lime', hex: '#7cb342' },
  { name: 'Yellow', hex: '#f9ab00' },
  { name: 'Orange', hex: '#ff6d00' },
  { name: 'Red', hex: '#ea4335' },
  { name: 'Rose', hex: '#e91e63' },
  { name: 'Purple', hex: '#9c27b0' },
  { name: 'Black', hex: '#202124' },
  { name: 'Grey', hex: '#5f6368' },
  { name: 'White', hex: '#ffffff' },
]

export const FONT_FAMILIES = [
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lato',
  'Montserrat',
  'Open Sans',
  'Roboto',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]

const P = (runs: TextRun[], extra: Partial<Paragraph> = {}): Paragraph => ({
  runs,
  ...extra,
})

export function defaultParagraphs(text: string, runProps: Partial<TextRun> = {}): Paragraph[] {
  return text.split('\n').map((line) => P([{ text: line, ...runProps }]))
}

export function createShape(
  type: ShapeType,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<ShapeBase> = {},
): ShapeBase {
  const fill =
    type === 'text'
      ? undefined
      : opts.fill ?? { type: 'solid', color: '#4a90d9' }
  return {
    id: uid(),
    type,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 100,
    fill,
    ...opts,
  } as ShapeBase
}

export function createTextShape(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<ShapeBase> & { fontFamily?: string; size?: number; color?: Hex } = {},
): ShapeBase {
  return createShape('text', x, y, width, height, {
    fill: opts.fill,
    stroke: opts.stroke,
    verticalAlign: 'top',
    wordWrap: true,
    paragraphs: defaultParagraphs(text, {
      fontFamily: opts.fontFamily ?? 'Calibri',
      size: opts.size ?? 20,
      color: opts.color ?? '#202124',
    }),
    ...opts,
  })
}

export function createImageShape(
  src: string,
  natW: number,
  natH: number,
  x: number,
  y: number,
  maxW = 600,
  maxH = 400,
): Shape {
  const scale = Math.min(1, maxW / natW, maxH / natH)
  return {
    id: uid(),
    type: 'image',
    src,
    naturalWidth: natW,
    naturalHeight: natH,
    x,
    y,
    width: natW * scale,
    height: natH * scale,
    rotation: 0,
    opacity: 100,
  }
}

// ---- Built-in layouts (Google Slides style) ----
export interface LayoutDef {
  id: string
  label: string
  build: (w: number, h: number) => Shape[] // placeholder shapes
}

const placeholders = {
  title: (w: number, h: number): Shape =>
    createTextShape('Click to add title', 40, 40, w - 80, 70, {
      placeholder: 'title',
      fill: { type: 'solid', color: '#ffffff', transparency: 100 },
      fontFamily: 'Calibri',
      size: 36,
      color: '#202124',
      verticalAlign: 'middle',
    }),
  subtitle: (w: number, h: number): Shape =>
    createTextShape('Click to add subtitle', 40, 120, w - 80, 50, {
      placeholder: 'subtitle',
      fill: { type: 'solid', color: '#ffffff', transparency: 100 },
      fontFamily: 'Calibri',
      size: 22,
      color: '#5f6368',
      verticalAlign: 'middle',
    }),
  body: (w: number, h: number): Shape =>
    createTextShape('Click to add text', 40, 140, w - 80, h - 220, {
      placeholder: 'body',
      fill: { type: 'solid', color: '#ffffff', transparency: 100 },
      fontFamily: 'Calibri',
      size: 18,
      color: '#202124',
      verticalAlign: 'top',
    }),
}

export const BUILTIN_LAYOUTS: LayoutDef[] = [
  {
    id: 'title',
    label: 'Title Slide',
    build: (w, h) => [
      placeholders.title(w, h),
      placeholders.subtitle(w, h),
    ],
  },
  {
    id: 'titleAndBody',
    label: 'Title and body',
    build: (w, h) => [placeholders.title(w, h), placeholders.body(w, h)],
  },
  {
    id: 'titleOnly',
    label: 'Title only',
    build: (w, h) => [
      createTextShape('Click to add title', 40, 40, w - 80, 70, {
        placeholder: 'title',
        fontFamily: 'Calibri',
        size: 36,
        color: '#202124',
        verticalAlign: 'middle',
      }),
    ],
  },
  { id: 'blank', label: 'Blank', build: () => [] },
]

export function layoutPlaceholders(layoutId: string, w: number, h: number): Shape[] {
  const def = BUILTIN_LAYOUTS.find((l) => l.id === layoutId)
  if (!def) return []
  return def.build(w, h)
}

// ---- Default deck ----
export function createDefaultDeck(): Deck {
  const w = 960
  const h = 540
  const slides: Slide[] = []

  const slide1: Slide = {
    id: uid(),
    layout: 'title',
    background: {
      type: 'gradient',
      angle: 315,
      stops: [
        { color: '#1a73e8', position: 0 },
        { color: '#4285f4', position: 55 },
        { color: '#9c72e8', position: 100 },
      ],
    },
    shapes: [
      createTextShape('Welcome to Slides', 80, 170, 800, 90, {
        fontFamily: 'Arial Black',
        size: 54,
        color: '#ffffff',
        verticalAlign: 'middle',
      }),
      createTextShape('A browser-based PPTX editor', 80, 275, 800, 45, {
        fontFamily: 'Calibri',
        size: 26,
        color: '#e8f0fe',
        verticalAlign: 'middle',
      }),
    ],
    notes: 'Introduce the product.',
  }

  const title2 = 'Shapes, text, images & more'
  const slide2: Slide = {
    id: uid(),
    layout: 'titleAndBody',
    background: { type: 'solid', color: '#ffffff' },
    shapes: [
      placeholders.title(w, h),
      createShape('rtArrow', 80, 180, 120, 120, { fill: { type: 'solid', color: '#34a853' } }),
      createShape('ellipse', 300, 180, 150, 120, { fill: { type: 'solid', color: '#f9ab00' } }),
      createShape('pentagon', 560, 180, 160, 130, { fill: { type: 'solid', color: '#9c27b0' } }),
      createShape('roundRect', 790, 180, 150, 110, {
        fill: { type: 'solid', color: '#ea4335' },
        stroke: { color: '#202124', width: 2, dash: 'dash' },
        shadow: { color: '#202124', transparency: 50, blur: 10, offsetX: 4, offsetY: 4 },
      }) as ShapeBase,
      createTextShape(
        ['Move', 'Resize', 'Rotate', 'Delete', 'Style'].join('\n'),
        80,
        340,
        700,
        140,
        {
          fontFamily: 'Calibri',
          size: 18,
          color: '#202124',
          verticalAlign: 'top',
        },
      ),
    ],
    notes: '',
  }

  const slide3: Slide = {
    id: uid(),
    layout: 'titleAndBody',
    background: { type: 'solid', color: '#ffffff' },
    shapes: [
      placeholders.title(w, h),
      createShape('rect', 80, 180, 350, 250, {
        fill: { type: 'gradient', angle: 90, stops: [
          { color: '#1a73e8', position: 0 },
          { color: '#4fc3f7', position: 100 },
        ]},
        stroke: { color: '#0d47a1', width: 2 },
        paragraphs: defaultParagraphs('Gradient fill\nwith shadow', {
          fontFamily: 'Calibri',
          size: 22,
          color: '#ffffff',
          bold: true,
        }),
        verticalAlign: 'middle',
        shadow: { color: '#1a237e', transparency: 30, blur: 16, offsetX: 6, offsetY: 8 },
      }),
      createShape('rect', 500, 180, 380, 250, {
        fill: { type: 'solid', color: '#f8f9fa' },
        stroke: { color: '#dadce0', width: 1 },
        paragraphs: defaultParagraphs('• Bullet one\n• Bullet two\n• Bullet three', {
          fontFamily: 'Calibri',
          size: 18,
          color: '#202124',
        }),
        verticalAlign: 'top',
      }),
    ],
    notes: '',
  }

  slides.push(slide1, slide2, slide3)

  return { title: 'Untitled presentation', slideWidth: w, slideHeight: h, slides }
}

export function createSlide(layout = 'titleAndBody', w = 960, h = 540): Slide {
  return {
    id: uid(),
    layout,
    background: { type: 'solid', color: '#ffffff' },
    shapes: layoutPlaceholders(layout, w, h),
    notes: '',
    transition: { type: 'none', duration: 400 },
  }
}

// Clones a slide (for duplicate / copy-paste between decks)
export function cloneSlide(slide: Slide): Slide {
  return JSON.parse(JSON.stringify({ ...slide, id: uid() }))
}