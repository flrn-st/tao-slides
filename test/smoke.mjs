import { readFileSync } from 'fs'
import { importPptx } from '../src/lib/importPptx'
import { exportPptx } from '../src/lib/exportPptx'

const buf = readFileSync('example-data/Extlst-test.pptx')
const file = {
  name: 'Extlst-test.pptx',
  arrayBuffer: async () => {
    const b = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return b
  },
}

async function main() {
const deck = await importPptx(file)
console.log('=== IMPORT ===')
console.log('title:', deck.title)
console.log('size:', deck.slideWidth, 'x', deck.slideHeight)
console.log('theme fonts:', deck.theme?.majorFont, '/', deck.theme?.minorFont)
console.log('slides:', deck.slides.length)
for (let i = 0; i < deck.slides.length; i++) {
  const s = deck.slides[i]
  const kinds = {}
  for (const sh of s.shapes) kinds[sh.type] = (kinds[sh.type] ?? 0) + 1
  console.log(`slide ${i + 1}: bg=${s.background?.type} shapes=${s.shapes.length}`, JSON.stringify(kinds), 'notes=', s.notes.length ? s.notes.length + 'ch' : 'none')
  const tb = s.shapes.filter((x) => x.type === 'text')
  if (tb[0]) {
    const first = tb[0]
    console.log('   first text shape:', JSON.stringify((first.paragraphs ?? []).map((p) => ({ t: p.runs.map((r) => r.text).join(''), a: p.align, b: p.bullet, f: p.runs[0]?.fontFamily, sz: p.runs[0]?.size, c: p.runs[0]?.color }))))
  }
}

console.log('\n=== EXPORT ===')
const blob = await exportPptx(deck)
console.log('export bytes:', blob.size)
const rdeck = await importPptx({
  name: 'roundtrip.pptx',
  arrayBuffer: async () => blob.arrayBuffer(),
})
console.log('roundtrip slides:', rdeck.slides.length)
for (let i = 0; i < rdeck.slides.length; i++) {
  const a = deck.slides[i], b = rdeck.slides[i]
  console.log(`slide ${i + 1}: shapes ${a.shapes.length} -> ${b.shapes.length}; bg ${a.background?.type} -> ${b.background?.type}`)
}

const firstSlideShapes = deck.slides[0]?.shapes ?? []
JSON.stringify(firstSlideShapes)
}
main()