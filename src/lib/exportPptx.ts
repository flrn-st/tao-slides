import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import type {
  Deck,
  Fill,
  Shape,
  ShapeBase,
  LineShape,
  ImageShape,
  Paragraph,
  TextRun,
  DashType,
} from '../types'

const PX_PER_INCH = 96

// The editor model uses CSS pixels (PPTX EMUs are converted at 96 px/in on
// import), while PptxGenJS expects all geometry in inches.
function inches(px: number): number {
  return Math.round((px / PX_PER_INCH) * 10000) / 10000
}

const SHAPE_MAP: Record<string, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  rightTriangle: 'rightTriangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  chevron: 'chevron',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  ltArrow: 'leftArrow',
  rtArrow: 'rightArrow',
  upArrow: 'upArrow',
  dnArrow: 'downArrow',
  star5: 'star5',
  heart: 'heart',
  cloud: 'cloud',
  text: 'rect',
}

const DASH_MAP: Record<DashType, string | undefined> = {
  solid: undefined,
  dash: 'dash',
  dot: 'dot',
  dashDot: 'dashDot',
}

function hexNoHash(c: string): string {
  return c.replace('#', '').toUpperCase()
}

function fillProps(fill: Fill | undefined, def: string): any {
  if (!fill || (fill as any).type === 'none') return { color: def, transparency: 100 }
  if (fill.type === 'solid') {
    return {
      color: hexNoHash(fill.color),
      transparency: Math.round(fill.transparency ?? 0),
    }
  }
  const stops = fill.stops
    .filter((s) => s && s.color)
    .map((s) => ({
      position: Math.round((s.position ?? 0) * 10) / 10,
      color: hexNoHash(s.color),
      transparency: Math.round(s.transparency ?? 0),
    }))
  // PptxGenJS 3.x does not serialize gradient shape fills. Use the first
  // visible stop instead of silently exporting an unfilled shape.
  return {
    color: stops[0]?.color ?? def,
    transparency: stops[0]?.transparency ?? 0,
  }
}

function shadowProps(shadow: ShapeBase['shadow']): any {
  if (!shadow) return undefined
  const dist = Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2)
  const angle = (Math.atan2(shadow.offsetX, shadow.offsetY) * 180) / Math.PI
  return {
    type: 'outer',
    color: hexNoHash(shadow.color),
    blur: shadow.blur,
    offset: Math.round(dist * 10) / 10,
    angle: Math.round(angle),
    opacity: Math.max(0.05, Math.min(1, (100 - (shadow.transparency ?? 0)) / 100)),
  }
}

function strokeProps(stroke: ShapeBase['stroke']): any {
  if (!stroke) return undefined
  return {
    color: hexNoHash(stroke.color),
    width: stroke.width,
    dashType: DASH_MAP[stroke.dash ?? 'solid'],
    transparency: Math.round(stroke.transparency ?? 0),
  }
}

function runOptions(r: TextRun): any {
  const opts: any = {}
  if (r.bold) opts.bold = true
  if (r.italic) opts.italic = true
  if (r.underline) opts.underline = true
  if (r.strike) opts.strike = true
  if (r.color && r.color !== '#000000') opts.color = hexNoHash(r.color)
  if (r.highlight) opts.highlight = hexNoHash(r.highlight)
  if (r.size) opts.fontSize = Math.round(r.size * 100) / 100
  if (r.fontFamily) opts.fontFace = r.fontFamily
  if (r.super) opts.superscript = true
  if (r.sub) opts.subscript = true
  if (r.spacing) opts.charSpacing = Math.round(r.spacing * 100) / 100
  return opts
}

export function paragraphsToPptx(paragraphs: Paragraph[] | undefined, def: Partial<TextRun>): any {
  if (!paragraphs?.length) return ''
  const textRuns: Array<{ text: string; options: any }> = []
  paragraphs.forEach((p, paragraphIndex) => {
    const paraOpts: any = {}
    if (p.align && p.align !== 'left') paraOpts.align = p.align
    if (p.bullet) {
      const char = p.bulletChar ?? '•'
      paraOpts.bullet = {
        characterCode: (char.codePointAt(0)?.toString(16).toUpperCase() ?? '2022').padStart(4, '0'),
        indent: Math.abs(p.firstLineIndent ?? 27),
      }
    }
    if (p.indentLevel) paraOpts.indentLevel = p.indentLevel
    if (p.lineSpacing) paraOpts.lineSpacingMultiple = p.lineSpacing
    if (p.spaceBefore) paraOpts.paraSpaceBefore = p.spaceBefore
    if (p.spaceAfter) paraOpts.paraSpaceAfter = p.spaceAfter
    const runs = p.runs.length ? p.runs : [{ text: '', ...def }]
    runs.forEach((r, runIndex) => {
      textRuns.push({
        text: r.text,
        options: {
          ...runOptions({ ...def, ...r }),
          ...(runIndex === 0 ? paraOpts : {}),
          ...(runIndex === runs.length - 1 && paragraphIndex < paragraphs.length - 1
            ? { breakLine: true }
            : {}),
        },
      })
    })
  })
  return textRuns
}

function shapeTextOpts(s: ShapeBase): any {
  const opts: any = { valign: s.verticalAlign ?? 'top' }
  if (s.autoFit === 'shrink') opts.textFit = 'shrink'
  else if (s.autoFit === 'resize') opts.textFit = 'resize'
  const ins = s.inset
  if (ins) {
    opts.margin = {
      left: ins.left,
      right: ins.right,
      top: ins.top,
      bottom: ins.bottom,
    }
  }
  if (s.wordWrap === false) opts.wrap = 'none'
  return opts
}

export async function exportPptx(deck: Deck): Promise<Blob> {
  const pptx = new PptxGenJS()
  const wIn = deck.slideWidth / PX_PER_INCH
  const hIn = deck.slideHeight / PX_PER_INCH
  pptx.defineLayout({ name: 'APP', width: wIn, height: hIn })
  pptx.layout = 'APP'
  const minorFont = deck.theme?.minorFont ?? 'Calibri'
  if (minorFont) {
    pptx.theme = {
      bodyFontFace: minorFont,
      headFontFace: deck.theme?.majorFont ?? minorFont,
    }
  }
  for (const slide of deck.slides) {
    const s = pptx.addSlide()
    const bg = slide.background ?? { type: 'solid', color: '#ffffff' }
    if (bg.type === 'image') {
      s.background = { color: 'FFFFFF' }
      drawImageBg(s, bg, deck)
    } else if (bg.type === 'gradient') {
      // pptxgenjs gradient *backgrounds* are not supported; approximate with first stop
      s.background = { color: hexNoHash(bg.stops[0]?.color ?? 'FFFFFF'), transparency: Math.round(bg.stops[0]?.transparency ?? 0) }
    } else if (bg.type === 'solid') {
      s.background = {
        color: hexNoHash(bg.color),
        transparency: Math.round(bg.transparency ?? 0),
      }
    } else {
      s.background = { color: 'FFFFFF' }
    }

    for (const shape of slide.shapes) {
      await addShapeToSlide(s, shape)
    }
    if (slide.notes) s.addNotes(slide.notes)
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  return embedOriginalFonts(blob, deck)
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function embedOriginalFonts(blob: Blob, deck: Deck): Promise<Blob> {
  if (!deck.embeddedFonts?.length) return blob
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const presentationEntry = zip.file('ppt/presentation.xml')
  const relsEntry = zip.file('ppt/_rels/presentation.xml.rels')
  const contentTypesEntry = zip.file('[Content_Types].xml')
  if (!presentationEntry || !relsEntry || !contentTypesEntry) return blob

  let presentationXml = await presentationEntry.async('string')
  let relsXml = await relsEntry.async('string')
  let contentTypesXml = await contentTypesEntry.async('string')
  const usedRelIds = Array.from(relsXml.matchAll(/\bId="rId(\d+)"/g), (match) => Number(match[1]))
  let nextRelId = Math.max(0, ...usedRelIds) + 1
  const embeddedXml: string[] = []

  for (let fontIndex = 0; fontIndex < deck.embeddedFonts.length; fontIndex++) {
    const font = deck.embeddedFonts[fontIndex]
    const styleXml: string[] = []
    for (const style of ['regular', 'bold', 'italic', 'boldItalic'] as const) {
      const data = font[style]
      if (!data) continue
      const relId = `rId${nextRelId++}`
      const safeFamily = font.fontFamily.replace(/[^a-z0-9_-]+/gi, '-') || `font-${fontIndex + 1}`
      const fileName = `${safeFamily}-${style}-${fontIndex + 1}.fntdata`
      zip.file(`ppt/fonts/${fileName}`, data, { base64: true })
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/${fileName}"/></Relationships>`,
      )
      styleXml.push(`<p:${style} r:id="${relId}"/>`)
    }
    if (styleXml.length) {
      embeddedXml.push(
        `<p:embeddedFont><p:font typeface="${xmlEscape(font.fontFamily)}"/>${styleXml.join('')}</p:embeddedFont>`,
      )
    }
  }

  if (!embeddedXml.length) return blob
  const listXml = `<p:embeddedFontLst>${embeddedXml.join('')}</p:embeddedFontLst>`
  if (presentationXml.includes('<p:defaultTextStyle')) {
    presentationXml = presentationXml.replace('<p:defaultTextStyle', `${listXml}<p:defaultTextStyle`)
  } else {
    presentationXml = presentationXml.replace('</p:presentation>', `${listXml}</p:presentation>`)
  }
  presentationXml = presentationXml.replace(
    /<p:presentation\b([^>]*)>/,
    (_match, rawAttrs: string) => {
      const attrs = rawAttrs.replace(/\s(?:embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, '')
      return `<p:presentation embedTrueTypeFonts="1" saveSubsetFonts="1"${attrs}>`
    },
  )
  if (!/Extension="fntdata"/.test(contentTypesXml)) {
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>',
    )
  }

  zip.file('ppt/presentation.xml', presentationXml)
  zip.file('ppt/_rels/presentation.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypesXml)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

function drawImageBg(s: any, bg: Extract<Deck['slides'][number]['background'], { type: 'image' }>, deck: Deck) {
  s.addImage({
    data: bg.src,
    x: 0,
    y: 0,
    w: deck.slideWidth / PX_PER_INCH,
    h: deck.slideHeight / PX_PER_INCH,
    transparency: bg.transparency ?? 0,
    sizing: bg.stretch ? 'cover' : 'contain',
  })
}

async function addShapeToSlide(s: any, shape: Shape) {
  if (shape.type === 'line') {
    const l = shape as LineShape
    const x1 = Math.min(l.x1, l.x2)
    const y1 = Math.min(l.y1, l.y2)
    const negativeSlope = (l.x2 - l.x1) * (l.y2 - l.y1) < 0
    const lineOpts: any = {
      x: inches(x1),
      y: inches(y1),
      w: inches(Math.abs(l.x2 - l.x1)),
      h: inches(Math.abs(l.y2 - l.y1)),
      // Flip vertically so the normalized bounding box preserves endpoint
      // order (and therefore head/tail arrow semantics) for negative slopes.
      flipV: negativeSlope,
      line: {
        color: hexNoHash(l.stroke.color),
        width: l.stroke.width,
        dashType: DASH_MAP[l.stroke.dash ?? 'solid'],
        transparency: l.stroke.transparency ?? 0,
      },
    }
    if (l.arrowStart) lineOpts.line.beginArrowType = 'triangle'
    if (l.arrowEnd) lineOpts.line.endArrowType = 'triangle'
    s.addShape('line', lineOpts)
    return
  }

  if (shape.type === 'image') {
    const im = shape as ImageShape
    s.addImage({
      data: im.src,
      x: inches(im.x),
      y: inches(im.y),
      w: inches(im.width),
      h: inches(im.height),
      rotate: im.rotation || 0,
      flipH: im.flipH,
      flipV: im.flipV,
      transparency: Math.max(0, 100 - (im.opacity ?? 100)),
      shadow: shadowProps(im.shadow),
      hyperlink: im.link,
    })
    return
  }

  const sh = shape as ShapeBase
  const shapeType = SHAPE_MAP[sh.type] ?? 'rect'
  const def: Partial<TextRun> = {
    fontFamily: sh.paragraphs?.[0]?.runs[0]?.fontFamily ?? 'Calibri',
    size: sh.paragraphs?.[0]?.runs[0]?.size ?? 18,
    color: sh.paragraphs?.[0]?.runs[0]?.color ?? '202124',
  }
  const common: any = {
    x: inches(sh.x),
    y: inches(sh.y),
    w: inches(sh.width),
    h: inches(sh.height),
    rotate: sh.rotation || 0,
    flipH: sh.flipH,
    flipV: sh.flipV,
    fill: fillProps(sh.fill as Fill, 'FFFFFF'),
    line: strokeProps(sh.stroke),
    shadow: shadowProps(sh.shadow),
    hyperlink: sh.link,
  }
  if (sh.type === 'roundRect' && sh.width && sh.height) {
    common.rectRadius = Math.min(0.5, (Math.min(sh.width, sh.height) * 0.1667) / Math.min(sh.width, sh.height))
  }

  if (sh.type === 'text') {
    s.addText(paragraphsToPptx(sh.paragraphs, def), {
      x: inches(sh.x),
      y: inches(sh.y),
      w: inches(sh.width),
      h: inches(sh.height),
      rotate: sh.rotation || 0,
      flipH: sh.flipH,
      flipV: sh.flipV,
      ...shapeTextOpts(sh),
      margin: shapeTextOpts(sh).margin,
      textFit: shapeTextOpts(sh).textFit,
      wrap: shapeTextOpts(sh).wrap,
      fill: fillProps(sh.fill as Fill, 'FFFFFF'),
      line: strokeProps(sh.stroke),
      shadow: shadowProps(sh.shadow),
      hyperlink: sh.link,
    })
    return
  }

  if (sh.paragraphs?.length) {
    // PptxGenJS models a text-bearing AutoShape through addText's `shape`
    // option. Passing rich text to addShape is ignored and eventually turns
    // nested run objects into the literal string "[object Object]".
    s.addText(paragraphsToPptx(sh.paragraphs, def), {
      ...common,
      shape: shapeType,
      ...shapeTextOpts(sh),
    })
  } else {
    s.addShape(shapeType, common)
  }
}
