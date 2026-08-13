import { writeFileSync } from 'fs'
import PptxGenJS from 'pptxgenjs'
import { importPptx } from '../src/lib/importPptx'
import { exportPptx } from '../src/lib/exportPptx'
import { createDefaultDeck } from '../src/lib/templates'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function main() {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'T', width: 10, height: 7.5 })
  pptx.layout = 'T'

  const s1 = pptx.addSlide()
  s1.background = { color: 'F8F9FA' }
  s1.addText(
    [{ text: 'Hello ', options: { bold: true } }, { text: 'World', options: { italic: true, color: 'FF0000' } }, { text: '!', options: { fontSize: 48 } }],
    { x: 1, y: 1, w: 8, h: 1, fontSize: 24, fontFace: 'Arial' },
  )
  s1.addShape('roundRect', {
    x: 1, y: 2.5, w: 3, h: 1.5, fill: { color: '34A853' }, line: { color: '000000', width: 2, dashType: 'dash' },
    shadow: { type: 'outer', color: '000000', blur: 6, offset: 3, angle: 45, opacity: 50 },
    text: [{ text: 'Rounded', options: { bold: true, color: 'FFFFFF', fontFace: 'Arial' } }],
  })
  s1.addShape('rect', { x: 1, y: 4.5, w: 3, h: 1.2, fill: { type: 'gradient', angle: 45, stops: [{ position: 0, color: '1A73E8' }, { position: 100, color: '9C72E8' }] } })
  s1.addShape('ellipse', { x: 4.5, y: 2.5, w: 1.5, h: 1.5, fill: { color: 'F9AB00' } })
  s1.addShape('rightArrow', { x: 6.5, y: 2.8, w: 2.5, h: 0.9, fill: { color: 'EA4335' } })
  s1.addImage({ data: png, x: 4.2, y: 4.4, w: 2, h: 2, sizing: { type: 'cover', w: 2, h: 2 } })
  s1.addNotes('Speaker notes go here!')
  s1.addShape('line', { x: 1, y: 6.9, w: 8, h: 0, line: { color: '000000', width: 2 } })
  s1.addText('• bullet one\n• bullet two', { x: 5, y: 4.5, w: 4, h: 1.5, bullet: { characterCode: '2022' } })

  const s2 = pptx.addSlide()
  s2.background = { color: 'F1F3F4' }
  s2.addText('Slide two title', { x: 1, y: 0.5, w: 8, h: 0.8, fontSize: 32, fontFace: 'Georgia' })
  s2.addShape('pentagon', { x: 3, y: 2, w: 2, h: 2, fill: { color: '9C27B0' } })
  s2.addShape('heart', { x: 6, y: 2, w: 2, h: 2, fill: { color: 'E91E63' } })

  const out = await pptx.write({ outputType: 'arraybuffer' })
  const buf = Buffer.from(out)
  writeFileSync('/tmp/opencode-smoke/gen.pptx', buf)
  console.log('generated gen.pptx', buf.length, 'bytes')

  const deck = await importPptx({ name: 'gen.pptx', arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })
  console.log('\n=== IMPORTED DECK ===')
  console.log('size', deck.slideWidth, 'x', deck.slideHeight)
  const shapeCountByType = {}
  for (let i = 0; i < deck.slides.length; i++) {
    const s = deck.slides[i]
    console.log(`slide ${i + 1}: bg=${JSON.stringify(s.background)} shapes=${s.shapes.length} notes=${JSON.stringify(s.notes.slice(0, 40))}`)
    for (const sh of s.shapes) {
      shapeCountByType[sh.type] = (shapeCountByType[sh.type] ?? 0) + 1
      if (sh.type === 'text') {
        console.log('   text:', JSON.stringify(sh.paragraphs?.map((p) => ({ runs: p.runs, align: p.align ?? null, bullet: p.bullet ?? null, ls: p.lineSpacing ?? null }))))
        break
      }
      if (sh.type === 'line') console.log('   line:', JSON.stringify({ x1: sh.x1, y1: sh.y1, x2: sh.x2, y2: sh.y2, sw: sh.stroke?.width }))
      if (sh.type === 'image') console.log('   image:', JSON.stringify({ w: sh.width, h: sh.height, nat: [sh.naturalWidth, sh.naturalHeight] }))
    }
  }
  console.log('kinds:', JSON.stringify(shapeCountByType))

  const blob2 = await exportPptx(deck)
  const rdeck = await importPptx({ name: 'rt.pptx', arrayBuffer: async () => blob2.arrayBuffer() })
  console.log('\n=== ROUND TRIP (import -> export -> import) ===')
  console.log('slides:', rdeck.slides.length)
  rdeck.slides.forEach((s, i) => {
    console.log(`slide ${i + 1}: ${s.shapes.length} shapes, bg=${s.background?.type}`)
  })

  const defBlob = await exportPptx(createDefaultDeck())
  const defDeck = await importPptx({ name: 'def.pptx', arrayBuffer: async () => defBlob.arrayBuffer() })
  console.log('\ndefault deck roundtrip slides:', defDeck.slides.length, 'shapes:', defDeck.slides.map((s) => s.shapes.length).join(','))
}
main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})