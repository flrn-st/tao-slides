import type { Hex, ShapeType, DashType } from '../types'

export const EMU_PER_PX = 9525
export const PX = (emu: number) => Math.round(emu / EMU_PER_PX)
export const EMU = (px: number) => Math.round(px * EMU_PER_PX)
export const PT_TO_PX = 96 / 72
export const PX_TO_PT = 72 / 96

// ---- Colors ----
export function hexToRgb(hex: Hex): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}
export function rgbToHex(r: number, g: number, b: number): Hex {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
// alpha 0-1 -> hex with transparency applied (blend on white, PPT-style)
export function rgba(r: number, g: number, b: number, a: number): Hex {
  return rgbToHex(r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a))
}
// remove transparency *relative to a base* — we just return the raw color for UI
export function withTransparency(hex: Hex, transparencyPct: number): Hex {
  const [r, g, b] = hexToRgb(hex)
  return rgba(r, g, b, 1 - transparencyPct / 100)
}
// CSS/Fabric color with real alpha. Use this for rendering; the helper above
// intentionally flattens onto white and is only suitable when a Hex is needed.
export function withAlpha(hex: Hex, transparencyPct: number): string {
  const [r, g, b] = hexToRgb(hex)
  const alpha = Math.max(0, Math.min(1, 1 - transparencyPct / 100))
  return `rgba(${r},${g},${b},${alpha})`
}
export function normalizeHex(v: string | undefined, fallback = '#000000'): Hex {
  if (!v) return fallback
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  const m = v.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (m) return `#${m[1]}${m[2]}${m[3]}`
  return fallback
}

// ---- Dash mapping ----
export const DASHES: Record<DashType, number[]> = {
  solid: [],
  dash: [8, 6],
  dot: [2, 4],
  dashDot: [8, 4, 2, 4],
}

// ---- Shape geometry ----
// Points in a 0..1000 coordinate box; polygons are scaled to the shape bbox.
export const SHAPE_TYPES: ShapeType[] = [
  'rect',
  'roundRect',
  'ellipse',
  'triangle',
  'rightTriangle',
  'diamond',
  'pentagon',
  'hexagon',
  'chevron',
  'parallelogram',
  'trapezoid',
  'ltArrow',
  'rtArrow',
  'upArrow',
  'dnArrow',
  'star5',
  'heart',
  'cloud',
  'text',
]

export const SHAPE_LABELS: Record<ShapeType, string> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Oval',
  triangle: 'Triangle',
  rightTriangle: 'Right triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  chevron: 'Chevron',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  ltArrow: 'Left arrow',
  rtArrow: 'Right arrow',
  upArrow: 'Up arrow',
  dnArrow: 'Down arrow',
  star5: 'Star',
  heart: 'Heart',
  cloud: 'Cloud',
  text: 'Text box',
}

export function shapePoints(type: ShapeType): [number, number][] {
  switch (type) {
    case 'triangle':
      return [
        [500, 0],
        [1000, 1000],
        [0, 1000],
      ]
    case 'rightTriangle':
      return [
        [0, 0],
        [1000, 1000],
        [0, 1000],
      ]
    case 'diamond':
      return [
        [500, 0],
        [1000, 500],
        [500, 1000],
        [0, 500],
      ]
    case 'pentagon':
      return [
        [500, 0],
        [1000, 380],
        [810, 1000],
        [190, 1000],
        [0, 380],
      ]
    case 'hexagon':
      return [
        [250, 0],
        [750, 0],
        [1000, 500],
        [750, 1000],
        [250, 1000],
        [0, 500],
      ]
    case 'chevron':
      return [
        [0, 0],
        [620, 0],
        [250, 500],
        [620, 1000],
        [0, 1000],
        [370, 500],
      ]
    case 'parallelogram':
      return [
        [250, 0],
        [1000, 0],
        [750, 1000],
        [0, 1000],
      ]
    case 'trapezoid':
      return [
        [200, 0],
        [800, 0],
        [1000, 1000],
        [0, 1000],
      ]
    case 'ltArrow':
      return [
        [380, 0],
        [380, 320],
        [1000, 320],
        [1000, 680],
        [380, 680],
        [380, 1000],
        [0, 500],
      ]
    case 'rtArrow':
      return [
        [620, 0],
        [1000, 500],
        [620, 1000],
        [620, 680],
        [0, 680],
        [0, 320],
        [620, 320],
      ]
    case 'upArrow':
      return [
        [1000, 380],
        [680, 380],
        [680, 1000],
        [320, 1000],
        [320, 380],
        [0, 380],
        [500, 0],
      ]
    case 'dnArrow':
      return [
        [1000, 620],
        [680, 620],
        [680, 0],
        [320, 0],
        [320, 620],
        [0, 620],
        [500, 1000],
      ]
    case 'star5':
      return starPoints(5, 500, 500, 500, 210)
    case 'heart':
      return heartPoints()
    case 'cloud':
      return cloudPoints()
    default:
      return []
  }
}

function starPoints(n: number, cx: number, cy: number, R: number, r: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? R : r
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
  }
  return pts
}

function heartPoints(): [number, number][] {
  const pts: [number, number][] = []
  // parametric heart
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2
    const x = 16 * Math.pow(Math.sin(t), 3)
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    pts.push([500 + x * 31, 500 - y * 31 - 80])
  }
  return pts
}

function cloudPoints(): [number, number][] {
  // blob of circles sampled evenly around center
  const cx = 500,
    cy = 520,
    R = 480
  const pts: [number, number][] = []
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    const wobble = 0.85 + 0.15 * Math.sin(a * 5) * Math.cos(a * 3)
    pts.push([cx + R * wobble * Math.cos(a), cy + R * wobble * 0.82 * Math.sin(a)])
  }
  return pts
}

// ---- Misc ----
export function uid(): string {
  // crypto-based id
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

export async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function imageDims(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Invalid image'))
    img.src = src
  })
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function downloadDataURL(dataUrl: string, name: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
}
