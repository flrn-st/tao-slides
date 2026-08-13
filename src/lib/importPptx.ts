import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type {
  Deck,
  Fill,
  GradientFill,
  ImageShape,
  LineShape,
  Paragraph,
  Shape,
  ShapeBase,
  Slide,
  TextRun,
  Background,
  Hex,
} from '../types'
import { uid, normalizeHex, clamp } from './utils'

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  textNodeName: '_',
  parseTagValue: false,
  // Spaces at rich-text run boundaries are significant in DrawingML. The
  // default trimming turns "Asset A" + " and " + "Asset B" into
  // "Asset AandAsset B".
  trimValues: false,
  isArray: (name: string) =>
    [
      'sp', 'pic', 'cxnSp', 'graphicFrame', 'grpSp', 'p', 'r', 'br', 't', 'txBody',
      'gradStop', 'bg', 'ph', 'defRPr', 'rPr', 'latin', 'solidFill', 'gradFill', 'noFill',
      'ln', 'effectLst', 'outerShdw', 'alpha', 'pPr', 'buNone', 'buChar', 'buAutoNum',
      'lnSpc', 'spcBef', 'spcAft', 'spcPct', 'spcPts', 'blipFill', 'blip', 'xfrm', 'off',
      'ext', 'chOff', 'chExt', 'sldIdLst', 'sldId', 'gsLst', 'gs', 'headEnd', 'tailEnd',
      'prstDash', 'a', 'b', 'i', 'u', 'strike', 'algn', 'lvl', 'cNvPr', 'cNvSpPr',
      'prstGeom', 'sldLayoutId', 'note', 'whole', 'ndLst', 'nvSpPr', 'nvPicPr', 'nvCxnSpPr',
      'bgPr', 'bgRef', 'highlight', 'txPr', 'wrap', 'anchor', 'spAutoFit', 'normAutofit',
      'embeddedFont', 'font', 'regular', 'bold', 'italic', 'boldItalic',
    ].includes(name),
})

const asArr = <T,>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v]

// Empty OOXML elements such as <a:noFill/> and <a:spAutoFit/> parse as an
// empty string. Test for node presence, not truthiness.
const hasNode = (v: unknown): boolean => v !== undefined && v !== null

const num = (v: unknown): number => (v === undefined || v === null ? NaN : parseFloat(String(v)))

const boolAttr = (v: unknown): boolean => v === '1' || v === 'true'

const textOf = (node: unknown): string => {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const n = node as any
  if (typeof n._ === 'string') return n._
  return ''
}

const emu = (v: unknown): number => (Number.isNaN(num(v)) ? 0 : num(v) / 9525)
const emuPt = (v: unknown): number => (Number.isNaN(num(v)) ? 0 : num(v) / 12700)

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ImportCtx {
  themeColors: Record<string, string>
  defaultMap: Record<string, string>
  majorFont: string
  minorFont: string
}

interface Resolved {
  color: Hex
  transparency: number
}

// ---------------------------------------------------------------------------
// Zip utilities
// ---------------------------------------------------------------------------

async function xmlOf(zip: JSZip, path: string): Promise<any | null> {
  const entry = zip.file(path)
  if (!entry) return null
  const str = await entry.async('string')
  try {
    return parser.parse(str)
  } catch (e) {
    console.warn('failed to parse', path, e)
    return null
  }
}

async function relsOf(zip: JSZip, path: string): Promise<Record<string, string>> {
  const doc = await xmlOf(zip, path)
  const map: Record<string, string> = {}
  for (const rel of asArr(doc?.Relationships?.Relationship)) {
    const id = rel['@_Id']
    const target = rel['@_Target']
    if (id && target) map[id] = target
  }
  return map
}

function zipPathFromRel(base: string, target: string): string {
  const clean = target.replace(/^\//, '')
  if (clean.startsWith('ppt/')) return clean
  const parts = base.split('/').filter(Boolean)
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

async function mediaDataURL(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path)
  if (!entry) return null
  const name = path.split('/').pop() ?? ''
  if (/\.(emf|wmf|xlsx|bin)$/i.test(name)) return null
  const b64 = await entry.async('base64')
  const ext = name.split('.').pop()?.toLowerCase() ?? 'png'
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'svg'
            ? 'image/svg+xml'
            : ext === 'bmp'
              ? 'image/bmp'
              : ext === 'webp'
                ? 'image/webp'
                : 'application/octet-stream'
  return `data:${mime};base64,${b64}`
}

function imageDims(src: string): Promise<{ width: number; height: number }> {
  if (typeof Image !== 'undefined') {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({ width: 1, height: 1 })
      img.src = src
    })
  }
  const m = src.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/)
  if (m) {
    try {
      const { width, height } = parseB64ImageDims(m[1], m[2])
      if (width > 0 && height > 0) return Promise.resolve({ width, height })
    } catch {}
  }
  return Promise.resolve({ width: 1, height: 1 })
}

function parseB64ImageDims(fmt: string, b64: string): { width: number; height: number } {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  if (fmt === 'png') {
    if (raw[0] === 0x89 && raw[1] === 0x50 && raw[12] === 0x49 && raw[13] === 0x48 && raw[14] === 0x44 && raw[15] === 0x52) {
      return { width: (raw[16] << 24) | (raw[17] << 16) | (raw[18] << 8) | raw[19], height: (raw[20] << 24) | (raw[21] << 16) | (raw[22] << 8) | raw[23] }
    }
  } else if (fmt === 'jpeg') {
    let i = 2
    while (i < raw.length - 1) {
      if (raw[i] !== 0xff) { i++; continue }
      const marker = raw[i + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { width: (raw[i + 7] << 8) | raw[i + 8], height: (raw[i + 5] << 8) | raw[i + 6] }
      }
      const segLen = (raw[i + 2] << 8) | raw[i + 3]
      i += 2 + segLen
    }
  } else if (fmt === 'gif') {
    return { width: raw[6] | (raw[7] << 8), height: raw[8] | (raw[9] << 8) }
  } else if (fmt === 'webp') {
    if (raw[12] === 0x56 && raw[13] === 0x50 && raw[14] === 0x38) {
      return { width: ((raw[26] << 8) | raw[27]) & 0x3fff, height: ((raw[28] << 8) | raw[29]) & 0x3fff }
    }
  }
  return { width: 1, height: 1 }
}

// ---------------------------------------------------------------------------
// Color resolution
// ---------------------------------------------------------------------------

const DEFAULT_CLR_MAP: Record<string, string> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hlink: 'hlink',
  folHlink: 'folHlink',
}

const FALLBACK_COLORS: Record<string, string> = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '1F3864',
  lt2: 'F2F2F2',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
}

function parseTheme(xml: any): { colors: Record<string, string>; majorFont: string; minorFont: string } {
  const colors: Record<string, string> = { ...FALLBACK_COLORS }
  const themeRoot = xml?.theme ?? xml
  const themeEls = asArr(themeRoot?.themeElements)[0]
  const cs = asArr(themeEls?.clrScheme)[0]
  for (const key of Object.keys(FALLBACK_COLORS)) {
    const node = asArr(cs?.[key])[0]
    if (!node) continue
    const srgb = asArr(node.srgbClr)[0]
    if (srgb?.['@_val']) {
      colors[key] = String(srgb['@_val']).toUpperCase()
      continue
    }
    const sys = asArr(node.sysClr)[0]
    if (sys?.['@_lastClr'] ?? sys?.['@_val']) {
      colors[key] = String(sys['@_lastClr'] ?? sys['@_val']).toUpperCase()
    }
  }
  const fs = asArr(themeEls?.fontScheme)[0]
  const major = asArr(asArr(fs?.majorFont)[0]?.latin)[0]?.['@_typeface'] ?? 'Calibri'
  const minor = asArr(asArr(fs?.minorFont)[0]?.latin)[0]?.['@_typeface'] ?? 'Calibri'
  return { colors, majorFont: major, minorFont: minor }
}

function parseAlpha(node: any): number {
  const alpha = asArr(node?.alpha)[0]
  if (alpha) return clamp(100 - num(alpha['@_val']) / 1000, 0, 100)
  return 0
}

function resolveSchemeColor(val: string, ctx: ImportCtx): string {
  const mapped = ctx.defaultMap[val] ?? val
  return ctx.themeColors[mapped] ?? FALLBACK_COLORS[val] ?? '000000'
}

export function parseColorNode(node: any, ctx: ImportCtx): Resolved | null {
  const srgb = asArr(node?.srgbClr)[0]
  if (srgb?.['@_val']) {
    return { color: normalizeHex('#' + String(srgb['@_val'])), transparency: parseAlpha(srgb) }
  }
  const scheme = asArr(node?.schemeClr)[0]
  if (scheme?.['@_val']) {
    return {
      color: normalizeHex('#' + resolveSchemeColor(String(scheme['@_val']), ctx)),
      transparency: parseAlpha(scheme),
    }
  }
  const sys = asArr(node?.sysClr)[0]
  if (sys?.['@_lastClr'] ?? sys?.['@_val']) {
    return { color: normalizeHex('#' + String(sys['@_lastClr'] ?? sys['@_val'])), transparency: 0 }
  }
  return null
}

function parseFill(node: any, ctx: ImportCtx): Fill | undefined {
  if (!node) return undefined
  const solid = asArr(node?.solidFill)[0]
  if (solid) {
    const c = parseColorNode(solid, ctx)
    if (c) return { type: 'solid', color: c.color, transparency: c.transparency || undefined }
    if (hasNode(solid?.noFill)) return { type: 'solid', color: '#ffffff', transparency: 100 }
    return undefined
  }
  const grad = asArr(node?.gradFill)[0]
  if (grad) {
    const stops: GradientFill['stops'] = []
    for (const gs of asArr(grad?.gsLst?.[0]?.gs)) {
      const c = parseColorNode(gs, ctx)
      if (c) {
        stops.push({
          color: c.color,
          transparency: c.transparency || undefined,
          position: clamp(num(gs['@_pos']) / 1000, 0, 100),
        })
      }
    }
    const lin = asArr(grad?.lin)[0]
    const pptAng = lin ? num(lin['@_ang']) / 60000 : 90
    if (stops.length >= 2) {
      // ppt 0 = left->right ; ours 0 = top->bottom
      return { type: 'gradient', angle: (pptAng + 90) % 360, stops }
    }
    if (stops.length === 1) {
      return { type: 'solid', color: stops[0].color, transparency: stops[0].transparency }
    }
    return undefined
  }
  if (hasNode(node?.noFill)) {
    return undefined
  }
  return undefined
}

const EMPTY_CTX: ImportCtx = {
  themeColors: {},
  defaultMap: DEFAULT_CLR_MAP,
  majorFont: 'Calibri',
  minorFont: 'Calibri',
}

function parseShadow(node: any): ShapeBase['shadow'] | undefined {
  const sh = asArr(node?.effectLst?.[0]?.outerShdw)[0] ?? asArr(node?.outerShdw)[0]
  if (!sh) return undefined
  const c = parseColorNode(sh, EMPTY_CTX)
  const blur = emuPt(sh['@_blurRad'])
  const dist = emuPt(sh['@_dist'])
  const dir = (num(sh['@_dir']) / 60000) || 0
  const rad = (dir * Math.PI) / 180
  return {
    color: c?.color ?? '#202124',
    transparency: c?.transparency ?? 40,
    blur: Math.max(0, Math.round(blur * 2 * 10) / 10),
    offsetX: Math.round(dist * Math.sin(rad) * 10) / 10,
    offsetY: Math.round(dist * Math.cos(rad) * 10) / 10,
  }
}

// ---------------------------------------------------------------------------
// Xfrm
// ---------------------------------------------------------------------------

interface Xfrm {
  x: number
  y: number
  w: number
  h: number
  rot: number
  flipH: boolean
  flipV: boolean
}

function parseXfrm(node: any): Xfrm | null {
  // callers may pass spPr/grpSpPr container or the <a:xfrm> node itself
  const xfn = node?.xfrm?.[0] ?? node
  const off = asArr(xfn?.off)[0]
  const ext = asArr(xfn?.ext)[0]
  if (!ext) return null
  const x = off ? emu(off['@_x']) : 0
  const y = off ? emu(off['@_y']) : 0
  let w = emu(ext['@_cx'])
  let h = emu(ext['@_cy'])
  if (w <= 0 && h <= 0) return null
  if (w <= 0) w = 1
  if (h <= 0) h = 1
  const rot = num(xfn['@_rot']) / 60000 || 0
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    rot: ((((rot % 360) + 360) % 360)) as number,
    flipH: boolAttr(xfn['@_flipH']),
    flipV: boolAttr(xfn['@_flipV']),
  }
}

interface GroupTransform {
  x: number
  y: number
  childX: number
  childY: number
  scaleX: number
  scaleY: number
}

function applyGroupTransform(xf: Xfrm, grp: GroupTransform | null): Xfrm {
  if (!grp) return xf
  return {
    ...xf,
    x: Math.round(grp.x + (xf.x - grp.childX) * grp.scaleX),
    y: Math.round(grp.y + (xf.y - grp.childY) * grp.scaleY),
    w: Math.round(xf.w * grp.scaleX),
    h: Math.round(xf.h * grp.scaleY),
  }
}

// ---------------------------------------------------------------------------
// Text parsing
// ---------------------------------------------------------------------------

interface Defaults {
  fontFamily: string
  size: number
  color: string
}

function buildRun(text: string, rPr: any, ctx: ImportCtx, defs: Defaults): TextRun {
  const run: TextRun = { text }
  if (rPr) {
    if (boolAttr(rPr['@_b'])) run.bold = true
    if (boolAttr(rPr['@_i'])) run.italic = true
    if (rPr['@_u'] && rPr['@_u'] !== 'none') run.underline = true
    if (rPr['@_strike'] && rPr['@_strike'] !== 'noStrike') run.strike = true
    const sz = num(rPr['@_sz'])
    if (!Number.isNaN(sz) && sz > 0) run.size = sz / 100
    const baseline = num(rPr['@_baseline'])
    if (!Number.isNaN(baseline) && baseline !== 0) {
      if (baseline > 0) run.super = true
      else run.sub = true
    }
    const latin = asArr(rPr?.latin)[0]
    if (latin?.['@_typeface']) run.fontFamily = String(latin['@_typeface'])
    const fill = parseFill(rPr, ctx)
    if (fill && fill.type === 'solid') run.color = fill.color
    const hl = asArr(rPr?.highlight)[0]
    if (hl) {
      const hc = parseColorNode(hl, ctx)
      if (hc) run.highlight = hc.color
    }
  }
  run.fontFamily = run.fontFamily ?? defs.fontFamily
  run.size = run.size ?? defs.size
  run.color = run.color ?? defs.color
  return run
}

function parseParagraph(pNode: any, ctx: ImportCtx, defs: Defaults): Paragraph {
  const para: Paragraph = { runs: [] }
  const pPr = asArr(pNode?.pPr)[0]
  if (pPr) {
    const align = String(pPr['@_algn'] ?? asArr(pPr?.algn)[0]?.['@_val'] ?? '')
    if (align === 'ctr') para.align = 'center'
    else if (align === 'r') para.align = 'right'
    else if (align === 'just' || align === 'justLow' || align === 'dist') para.align = 'justify'
    else if (align === 'l') para.align = 'left'
    const lvl = num(pPr['@_lvl'])
    if (!Number.isNaN(lvl) && lvl > 0) para.indentLevel = Math.min(8, Math.round(lvl))
    const marL = num(pPr['@_marL'])
    const marR = num(pPr['@_marR'])
    const indent = num(pPr['@_indent'])
    if (!Number.isNaN(marL) && marL !== 0) para.marginLeft = emuPt(marL)
    if (!Number.isNaN(marR) && marR !== 0) para.marginRight = emuPt(marR)
    if (!Number.isNaN(indent) && indent !== 0) para.firstLineIndent = emuPt(indent)
    const lnSpc = asArr(pPr?.lnSpc)[0]
    if (lnSpc) {
      const pct = asArr(lnSpc?.spcPct)[0]
      if (pct?.['@_val']) para.lineSpacing = num(pct['@_val']) / 100000
    }
    const spcBef = asArr(pPr?.spcBef)[0]
    if (spcBef?.spcPts?.[0]?.['@_val']) para.spaceBefore = num(spcBef.spcPts[0]['@_val']) / 100
    const spcAft = asArr(pPr?.spcAft)[0]
    if (spcAft?.spcPts?.[0]?.['@_val']) para.spaceAfter = num(spcAft.spcPts[0]['@_val']) / 100
    const buChar = asArr(pPr?.buChar)[0]
    const buAuto = asArr(pPr?.buAutoNum)[0]
    if (hasNode(pPr?.buNone)) para.bullet = false
    else if (buChar || buAuto) {
      para.bullet = true
      if (buChar?.['@_char']) para.bulletChar = String(buChar['@_char'])
    }
  }
  if (pNode) {
    for (const r of asArr(pNode?.r)) {
      const t = asArr(r?.t).map(textOf).join('')
      if (!t) continue
      para.runs.push(buildRun(t, asArr(r?.rPr)[0], ctx, defs))
    }
  }
  if (para.runs.length === 0) para.runs.push({ text: '', ...defs })
  return para
}

function parseParagraphWithBreaks(pNode: any, ctx: ImportCtx, defs: Defaults): Paragraph[] {
  const para = parseParagraph(pNode, ctx, defs)
  const breakCount = asArr(pNode?.br).length
  if (breakCount === 0) return [para]

  // fast-xml-parser groups repeated sibling names, so the exact r/br ordering is
  // unavailable in this representation. Google Slides' PPTX output uses one run
  // on either side of each explicit break; retain those visual lines as separate
  // editor paragraphs. Leave unusual run arrangements intact instead of guessing.
  if (para.runs.length !== breakCount + 1) return [para]
  return para.runs.map((run) => ({ ...para, runs: [run] }))
}

function parseTxBody(txBody: any, ctx: ImportCtx, defs: Defaults): Paragraph[] {
  if (!txBody) return [{ runs: [{ text: '', ...defs }] }]
  const paras = asArr(txBody?.p).flatMap((p) => parseParagraphWithBreaks(p, ctx, defs))
  return paras.length ? paras : [{ runs: [{ text: '', ...defs }] }]
}

// ---------------------------------------------------------------------------
// Shape parsing
// ---------------------------------------------------------------------------

const PLACEHOLDER_MAP: Record<string, 'title' | 'subtitle' | 'body' | 'pic'> = {
  title: 'title',
  ctrTitle: 'title',
  subTitle: 'subtitle',
  body: 'body',
  pic: 'pic',
}

interface ShapeCommon {
  xf: Xfrm
  fill?: Fill
  stroke?: ShapeBase['stroke']
  shadow?: ShapeBase['shadow']
  phType?: 'title' | 'subtitle' | 'body' | 'pic'
  name?: string
  txBox: boolean
}

function parseShapeCommon(sp: any, ctx: ImportCtx, grp: GroupTransform | null): ShapeCommon | null {
  const spPr = asArr(sp?.spPr)[0]
  const xfRaw = spPr ? parseXfrm(spPr) : null
  if (!xfRaw) return null
  const xf = applyGroupTransform(xfRaw, grp)
  const fill = parseFill(spPr, ctx)
  const stroke: ShapeBase['stroke'] | undefined = (() => {
    const ln = asArr(spPr?.ln)[0]
    if (!ln) return undefined
    if (hasNode(ln?.noFill)) return undefined
    const c = parseColorNode(asArr(ln?.solidFill)[0] ?? ln, ctx)
    const w = num(ln['@_w'])
    const out: ShapeBase['stroke'] = {
      color: c?.color ?? '#000000',
      width: Number.isNaN(w) ? 0.75 : Math.max(0.5, emuPt(w)),
      transparency: c?.transparency,
    }
    const dash = asArr(ln?.prstDash)[0]
    const dashVal = dash?.['@_val'] as string | undefined
    if (dashVal === 'dash' || dashVal === 'sysDash') out.dash = 'dash'
    else if (dashVal === 'dot' || dashVal === 'sysDot') out.dash = 'dot'
    else if (dashVal === 'dashDot' || dashVal === 'sysDashDot') out.dash = 'dashDot'
    return out
  })()
  const shadow = parseShadow(spPr)
  const nvSpPr = asArr(sp?.nvSpPr)[0]
  let phType: ShapeCommon['phType'] = undefined
  const ph = asArr(sp?.ph)[0] ?? asArr(asArr(nvSpPr?.nvPr)[0]?.ph)[0]
  if (ph) {
    const t = String(ph['@_type'] ?? 'obj')
    phType = PLACEHOLDER_MAP[t]
  }
  const cNvPr = asArr(nvSpPr?.cNvPr)[0]
  const cNvSpPr = asArr(nvSpPr?.cNvSpPr)[0]
  const name = cNvPr?.['@_name'] ? String(cNvPr['@_name']) : undefined
  const txBox = boolAttr(cNvSpPr?.['@_txBox'])
  return { xf, fill, stroke, shadow, phType, name, txBox }
}

function parseTextShape(sp: any, ctx: ImportCtx, grp: GroupTransform | null): ShapeBase | null {
  const common = parseShapeCommon(sp, ctx, grp)
  if (!common) return null
  const txBody = asArr(sp?.txBody)[0]
  const bodyPr = asArr(txBody?.bodyPr)[0]
  let va: 'top' | 'middle' | 'bottom' = 'top'
  const anchor = bodyPr?.['@_anchor']
  if (anchor === 'ctr' || anchor === 'ctrC') va = 'middle'
  else if (anchor === 'b') va = 'bottom'
  let inset: { left: number; right: number; top: number; bottom: number } | undefined
  const lIns = bodyPr?.['@_lIns']
  const rIns = bodyPr?.['@_rIns']
  const tIns = bodyPr?.['@_tIns']
  const bIns = bodyPr?.['@_bIns']
  if (lIns || rIns || tIns || bIns) {
    inset = {
      left: emuPt(lIns),
      right: emuPt(rIns),
      top: emuPt(tIns),
      bottom: emuPt(bIns),
    }
  }
  let autoFit: ShapeBase['autoFit'] = undefined
  const normAutofit = asArr(bodyPr?.normAutofit)[0]
  if (hasNode(bodyPr?.normAutofit)) autoFit = 'shrink'
  else if (hasNode(bodyPr?.spAutoFit)) autoFit = 'resize'
  const rawFontScale = num(normAutofit?.['@_fontScale'])
  const rawLineSpacingReduction = num(normAutofit?.['@_lnSpcReduction'])
  const fontScale = !Number.isNaN(rawFontScale) && rawFontScale > 0 ? rawFontScale / 100000 : undefined
  const lineSpacingReduction = !Number.isNaN(rawLineSpacingReduction) && rawLineSpacingReduction > 0
    ? rawLineSpacingReduction / 100000
    : undefined

  const defs: Defaults = {
    fontFamily: ctx.minorFont ?? 'Calibri',
    size: 18,
    color: ctx.themeColors['dk1'] ?? '#202124',
  }
  const paragraphs = parseTxBody(txBody ?? {}, ctx, defs)
  const hasRealText = paragraphs.some((p) => p.runs.some((r) => r.text.trim()))

  if (common.phType === 'pic') {
    // picture placeholder: no image inside; skip unless text
    if (!hasRealText) return null
  }

  return {
    id: uid(),
    type: 'text',
    name: common.name,
    x: common.xf.x,
    y: common.xf.y,
    width: common.xf.w,
    height: common.xf.h,
    rotation: common.xf.rot,
    flipH: common.xf.flipH,
    flipV: common.xf.flipV,
    opacity: 100,
    fill: common.fill ?? (common.phType ? { type: 'solid', color: '#ffffff', transparency: 100 } : undefined),
    stroke: common.stroke,
    shadow: common.shadow,
    verticalAlign: va,
    inset: inset && (inset.left || inset.top || inset.right || inset.bottom) ? inset : undefined,
    autoFit,
    fontScale,
    lineSpacingReduction,
    wordWrap: bodyPr?.['@_wrap'] !== 'none',
    paragraphs: hasRealText ? paragraphs : undefined,
    placeholder: common.phType,
  }
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function parseBg(bgNode: any, ctx: ImportCtx): Background | undefined {
  if (!bgNode) return undefined
  const bgPr = bgNode.bgPr?.[0] ?? bgNode.bgRef?.[0] ?? bgNode
  const fill = parseFill(bgPr, ctx)
  if (fill) return fill as Background
  const blipFill = asArr(bgPr?.blipFill)[0]
  if (blipFill) {
    const blip = asArr(blipFill?.blip)[0]
    const embed = blip?.['@_r_embed'] ?? blip?.['@_embed']
    if (embed) {
      return { type: 'image', src: `rel:${embed}`, stretch: true }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------

export async function importPptx(file: File): Promise<Deck> {
  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)

  const prs = await xmlOf(zip, 'ppt/presentation.xml')
  if (!prs) throw new Error('Not a valid PowerPoint file')
  const sldSz = asArr(prs?.presentation?.sldSz)[0] ?? asArr(prs?.sldSz)[0]
  const slideWidth = sldSz ? emu(sldSz['@_cx']) : 960
  const slideHeight = sldSz ? emu(sldSz['@_cy']) : 540

  // --- theme ---
  const prsRels = await relsOf(zip, 'ppt/_rels/presentation.xml.rels')
  const embeddedFonts: NonNullable<Deck['embeddedFonts']> = []
  const embeddedFontList = asArr(prs?.presentation?.embeddedFontLst)[0] ?? asArr(prs?.embeddedFontLst)[0]
  for (const embedded of asArr(embeddedFontList?.embeddedFont)) {
    const fontFamily = String(asArr(embedded?.font)[0]?.['@_typeface'] ?? '').trim()
    if (!fontFamily) continue
    const out: NonNullable<Deck['embeddedFonts']>[number] = { fontFamily }
    for (const style of ['regular', 'bold', 'italic', 'boldItalic'] as const) {
      const node = asArr(embedded?.[style])[0]
      const relId = node?.['@_r_id'] ?? node?.['@_id']
      const target = relId ? prsRels[String(relId)] : undefined
      const entry = target ? zip.file(zipPathFromRel('ppt', target)) : null
      if (entry) out[style] = await entry.async('base64')
    }
    if (out.regular || out.bold || out.italic || out.boldItalic) embeddedFonts.push(out)
  }
  const masterRelTarget = Object.values(prsRels).find((t) => t.includes('slideMaster'))
  const masterPath = masterRelTarget ? zipPathFromRel('ppt', masterRelTarget) : 'ppt/slideMasters/slideMaster1.xml'
  const masterXml = await xmlOf(zip, masterPath)
  const masterRels = await relsOf(zip, masterPath.replace(/\/[^/]+$/, '/_rels/') + masterPath.split('/').pop() + '.rels')
  const themeTarget = Object.values(masterRels).find((t) => t.includes('theme'))
  const themeXml = themeTarget
    ? await xmlOf(zip, zipPathFromRel(masterPath.slice(0, masterPath.lastIndexOf('/')), themeTarget))
    : await xmlOf(zip, 'ppt/theme/theme1.xml')
  const theme = parseTheme(themeXml ?? {})

  const ctx: ImportCtx = {
    themeColors: theme.colors,
    defaultMap: { ...DEFAULT_CLR_MAP },
    majorFont: theme.majorFont,
    minorFont: theme.minorFont,
  }
  const clrMap = asArr(masterXml?.sldMaster?.clrMap)[0] ?? asArr(masterXml?.clrMap)[0]
  if (clrMap) {
    for (const key of ['bg1', 'tx1', 'bg2', 'tx2']) {
      const v = clrMap['@_' + key]
      if (v) ctx.defaultMap[key] = String(v)
    }
  }

  // A slide with no local or layout background inherits its master
  // background. Omitting this made dark-theme presentations render white.
  let masterBg: Background | undefined
  const masterRoot = masterXml?.sldMaster ?? masterXml
  const masterCSld = asArr(masterRoot?.cSld)[0]
  const parsedMasterBg = parseBg(asArr(masterCSld?.bg)[0], ctx)
  if (parsedMasterBg?.type === 'image' && parsedMasterBg.src.startsWith('rel:')) {
    const target = masterRels[parsedMasterBg.src.slice(4)]
    const src = target
      ? await mediaDataURL(zip, zipPathFromRel(masterPath.slice(0, masterPath.lastIndexOf('/')), target))
      : null
    if (src) masterBg = { type: 'image', src, stretch: true }
  } else if (parsedMasterBg) {
    masterBg = parsedMasterBg
  }

  // --- slide order ---
  const slideOrder: string[] = []
  const sldIds = asArr(prs?.presentation?.sldIdLst?.[0]?.sldId)
  for (const sid of sldIds) {
    const rId = sid['@_r_id'] ?? sid['@_id']
    const t = rId ? prsRels[rId] : undefined
    if (t) slideOrder.push(zipPathFromRel('ppt', t))
  }
  if (slideOrder.length === 0) {
    const files: string[] = []
    zip.forEach((p) => {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(p)) files.push(p)
    })
    files.sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]))
    slideOrder.push(...files)
  }

  const slides: Slide[] = []

  for (const slidePath of slideOrder) {
    const slideXml = await xmlOf(zip, slidePath)
    if (!slideXml) continue
    const rels = await relsOf(zip, slidePath.replace(/\/[^/]+$/, '/_rels/') + slidePath.split('/').pop() + '.rels')
    const layoutTarget = Object.values(rels).find((t) => t.includes('slideLayout'))
    const notesTarget = Object.values(rels).find((t) => t.includes('notesSlide'))

    // layout background
    let layoutBg: Background | undefined
    if (layoutTarget) {
      const layoutPath = zipPathFromRel(slidePath.slice(0, slidePath.lastIndexOf('/')), layoutTarget)
      const layoutXml = await xmlOf(zip, layoutPath)
      const bgNode = asArr(layoutXml?.sldLayout?.cSld?.[0]?.bg)[0] ?? asArr(layoutXml?.cSld?.[0]?.bg)[0]
      const bg = parseBg(bgNode, ctx)
      if (bg && bg.type === 'image' && typeof bg.src === 'string' && bg.src.startsWith('rel:')) {
        const lrel = await relsOf(zip, layoutPath.replace(/\/[^/]+$/, '/_rels/') + layoutPath.split('/').pop() + '.rels')
        const src = await mediaDataURL(zip, zipPathFromRel(layoutPath.slice(0, layoutPath.lastIndexOf('/')), lrel[bg.src.slice(4)] ?? ''))
        if (src) layoutBg = { type: 'image', src, stretch: true }
      } else if (bg) {
        layoutBg = bg
      }
    }

    const sldEl = slideXml?.sld ?? slideXml
    const cSld = asArr(sldEl?.cSld)[0]
    const spTree = cSld?.spTree?.[0] ?? cSld?.spTree
    const shapes: Shape[] = []

    const walk = async (node: any, grp: GroupTransform | null) => {
      if (!node || typeof node !== 'object') return
      for (const key of Object.keys(node)) {
        const val = node[key]
        if (key === 'grpSp') {
          for (const g of asArr(val)) {
            const gPr = asArr(g?.grpSpPr)[0] ?? g
            const chOff = asArr(gPr?.chOff)[0]
            const chExt = asArr(gPr?.chExt)[0]
            if (chOff && chExt) {
              const base = parseXfrm(gPr)
              if (base) {
                const outer = applyGroupTransform(base, grp)
                const childW = Math.max(1e-6, emu(chExt['@_cx']))
                const childH = Math.max(1e-6, emu(chExt['@_cy']))
                const t: GroupTransform = {
                  x: outer.x,
                  y: outer.y,
                  childX: emu(chOff['@_x']),
                  childY: emu(chOff['@_y']),
                  scaleX: outer.w / childW,
                  scaleY: outer.h / childH,
                }
                await walk(g, t)
                continue
              }
            }
            await walk(g, grp)
          }
        } else if (key === 'sp') {
          for (const sp of asArr(val)) {
            const common = parseShapeCommon(sp, ctx, grp)
            if (!common) continue
            const prst = String(
              asArr(sp?.prstGeom)[0]?.['@_prst'] ??
                asArr(asArr(sp?.spPr)[0]?.prstGeom)[0]?.['@_prst'] ??
                '',
            )
            if (prst) {
              if (prst === 'line') {
                const line = parseLineShape(sp, ctx, grp)
                if (line) shapes.push(line)
              } else {
                const s = parseTextShape(sp, ctx, grp)
                if (s) {
                  const hasVisibleBox = !!s.fill || !!s.stroke
                  const noFillLooksLikeTextbox = prst === 'rect' && !hasVisibleBox && !!s.paragraphs?.length
                  s.type = ((common.txBox && prst === 'rect') || prst === 'textBox') && !hasVisibleBox || noFillLooksLikeTextbox
                    ? 'text'
                    : mapPrstShape(prst)
                  shapes.push(s)
                }
              }
            } else {
              const line = parseLineShape(sp, ctx, grp)
              if (line) shapes.push(line)
            }
          }
        } else if (key === 'pic') {
          for (const pic of asArr(val)) {
            const img = await parseImageShape(pic, ctx, rels, zip, grp)
            if (img) shapes.push(img)
          }
        } else if (key === 'cxnSp') {
          for (const c of asArr(val)) {
            const line = parseLineShape(c, ctx, grp)
            if (line) shapes.push(line)
          }
        } else if (key === 'graphicFrame') {
          continue // charts / smartart / tables unsupported (best-effort skip)
        }
      }
    }

    async function parseImageShape(
      pic: any,
      ctx: ImportCtx,
      relMap: Record<string, string>,
      zip: JSZip,
      grp: GroupTransform | null,
    ): Promise<ImageShape | null> {
      const spPr = asArr(pic?.spPr)[0]
      const xfRaw = spPr ? parseXfrm(spPr) : null
      if (!xfRaw) return null
      const xf = applyGroupTransform(xfRaw, grp)
      const blip = asArr(pic?.blipFill?.[0]?.blip)[0]
      const embed = blip?.['@_r_embed'] ?? blip?.['@_embed']
      if (!embed) return null
      const target = relMap[embed]
      if (!target) return null
      const src = await mediaDataURL(zip, zipPathFromRel(slidePath.slice(0, slidePath.lastIndexOf('/')), target))
      if (!src) return null
      const dims = await imageDims(src)
      const cNvPr = asArr(asArr(pic?.nvPicPr)[0]?.cNvPr)[0]
      const img: ImageShape = {
        id: uid(),
        type: 'image',
        name: cNvPr?.['@_name'] ? String(cNvPr['@_name']) : undefined,
        src,
        naturalWidth: dims.width,
        naturalHeight: dims.height,
        x: xf.x,
        y: xf.y,
        width: xf.w,
        height: xf.h,
        rotation: ((xf.rot % 360) + 360) % 360,
        flipH: xf.flipH,
        flipV: xf.flipV,
        opacity: 100,
      }
      return img
    }

    await walk(spTree, null)

    // slide background
    let bg: Background | undefined
    const sldBg = asArr(cSld?.bg)[0]
    if (sldBg) {
      bg = parseBg(sldBg, ctx)
      if (bg && bg.type === 'image' && typeof bg.src === 'string' && bg.src.startsWith('rel:')) {
        const src = await mediaDataURL(zip, zipPathFromRel(slidePath.slice(0, slidePath.lastIndexOf('/')), rels[bg.src.slice(4)] ?? ''))
        if (src) bg = { type: 'image', src, stretch: true }
        else bg = undefined
      }
    }
    if (!bg && layoutBg) bg = layoutBg
    if (!bg && masterBg) bg = masterBg

    // notes
    let notes = ''
    if (notesTarget) {
      const notesPath = zipPathFromRel(slidePath.slice(0, slidePath.lastIndexOf('/')), notesTarget)
      const notesXml = await xmlOf(zip, notesPath)
      const notesTree = asArr(notesXml?.notes?.cSld?.spTree)[0] ?? asArr(notesXml?.cSld?.spTree)[0]
      if (notesTree) {
        // only the notes body placeholder carries speaker notes
        const bodyParts: string[] = []
        for (const sp of asArr(notesTree?.sp)) {
          const ph =
            asArr(sp?.ph)[0] ??
            asArr(asArr(sp?.nvSpPr)[0]?.nvPr?.ph)[0]
          const phType = ph ? String(ph['@_type'] ?? '') : ''
          const isBody = phType === 'body' || phType === 'obj' || (!phType && !!ph)
          if (!isBody) continue
          const txBody = asArr(sp?.txBody)[0]
          if (!txBody) continue
          const paras = asArr(txBody?.p)
          const texts: string[] = []
          for (const p of paras) {
            const line = asArr(p?.r)
              .map((r) => asArr(r?.t).map(textOf).join(''))
              .join('')
            texts.push(line)
          }
          if (texts.some((t) => t)) bodyParts.push(texts.join('\n'))
        }
        notes = bodyParts.join('\n').trim()
      }
    }

    slides.push({
      id: uid(),
      background: bg,
      shapes,
      notes,
      layout: undefined,
      transition: { type: 'none', duration: 400 },
    })
  }

  return {
    title: file.name.replace(/\.pptx?$/i, ''),
    slideWidth: Math.round(slideWidth),
    slideHeight: Math.round(slideHeight),
    slides,
    theme: {
      minorFont: theme.minorFont,
      majorFont: theme.majorFont,
      colors: theme.colors,
    },
    embeddedFonts: embeddedFonts.length ? embeddedFonts : undefined,
  }
}

function parseLineShape(sp: any, ctx: ImportCtx, grp: GroupTransform | null = null): LineShape | null {
  const spPr = asArr(sp?.spPr)[0]
  if (!spPr) return null
  const rawXf = parseXfrm(spPr)
  if (!rawXf) return null
  const xf = applyGroupTransform(rawXf, grp)
  const stroke = lineStroke(spPr, ctx)
  if (!stroke) return null
  const ln = asArr(spPr?.ln)[0]
  const head = asArr(ln?.headEnd)[0]
  const tail = asArr(ln?.tailEnd)[0]
  const isArrow = (h: any) => h && h['@_type'] && h['@_type'] !== 'none'
  const x1 = xf.flipH ? xf.x + xf.w : xf.x
  const x2 = xf.flipH ? xf.x : xf.x + xf.w
  const y1 = xf.flipV ? xf.y + xf.h : xf.y
  const y2 = xf.flipV ? xf.y : xf.y + xf.h
  return {
    id: uid(),
    type: 'line',
    x1,
    y1,
    x2,
    y2,
    stroke,
    arrowStart: isArrow(head),
    arrowEnd: isArrow(tail),
    opacity: 100,
  }
}

function lineStroke(spPr: any, ctx: ImportCtx): LineShape['stroke'] | null {
  const ln = asArr(spPr?.ln)[0]
  const c = parseColorNode(asArr(ln?.solidFill)[0] ?? ln, ctx)
  const w = num(ln?.['@_w'])
  const stroke: LineShape['stroke'] = {
    color: c?.color ?? '#000000',
    width: Number.isNaN(w) ? 1 : Math.max(0.5, emuPt(w)),
    transparency: c?.transparency,
  }
  const dash = asArr(ln?.prstDash)[0]
  const dashVal = dash?.['@_val'] as string | undefined
  if (dashVal === 'dash' || dashVal === 'sysDash') stroke.dash = 'dash'
  else if (dashVal === 'dot' || dashVal === 'sysDot') stroke.dash = 'dot'
  else if (dashVal === 'dashDot') stroke.dash = 'dashDot'
  return stroke
}

function mapPrstShape(prst: string): ShapeBase['type'] {
  switch (prst) {
    case 'rect':
      return 'rect'
    case 'roundRect':
      return 'roundRect'
    case 'ellipse':
    case 'oval':
      return 'ellipse'
    case 'triangle':
      return 'triangle'
    case 'rtTriangle':
      return 'rightTriangle'
    case 'diamond':
      return 'diamond'
    case 'pentagon':
      return 'pentagon'
    case 'hexagon':
      return 'hexagon'
    case 'chevron':
      return 'chevron'
    case 'parallelogram':
      return 'parallelogram'
    case 'trapezoid':
      return 'trapezoid'
    case 'leftArrow':
      return 'ltArrow'
    case 'rightArrow':
    case 'stripedRightArrow':
    case 'notchedRightArrow':
      return 'rtArrow'
    case 'upArrow':
      return 'upArrow'
    case 'downArrow':
      return 'dnArrow'
    case 'star5':
      return 'star5'
    case 'heart':
      return 'heart'
    case 'cloud':
      return 'cloud'
    default:
      return 'rect'
  }
}

export function detectLegacyPpt(file: File): boolean {
  return /\.ppt$/i.test(file.name)
}

export function isSupportedFile(file: File): boolean {
  return /\.pptx?$/i.test(file.name)
}
