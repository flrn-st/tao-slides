import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { importPptx } from '../src/lib/importPptx.ts'
import { exportPptx } from '../src/lib/exportPptx.ts'

const sourceName = 'Customer Feedback Analysis _at Scale.pptx'

function fileFromBytes(name, bytes) {
  return {
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

function slideText(slide) {
  return slide.shapes
    .flatMap((shape) => shape.paragraphs ?? [])
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
    .join('\n')
}

async function main() {
  const sourceBytes = await readFile(`example-data/${sourceName}`)
  const source = await importPptx(fileFromBytes(sourceName, sourceBytes))
  assert.equal(source.embeddedFonts?.[0]?.fontFamily, 'Roboto Mono')
  assert.ok(source.embeddedFonts?.[0]?.regular)
  assert.ok(source.embeddedFonts?.[0]?.bold)
  assert.ok(source.embeddedFonts?.[0]?.italic)
  assert.ok(source.embeddedFonts?.[0]?.boldItalic)
  const exported = await exportPptx(source)
  const exportedBytes = new Uint8Array(await exported.arrayBuffer())
  await writeFile('tmp/Customer-Feedback-roundtrip.pptx', exportedBytes)

  const zip = await JSZip.loadAsync(exportedBytes)
  const presentationXml = await zip.file('ppt/presentation.xml').async('string')
  assert.match(presentationXml, /<p:font typeface="Roboto Mono"\/>/)
  assert.equal((presentationXml.match(/embedTrueTypeFonts=/g) ?? []).length, 1)
  assert.equal((presentationXml.match(/saveSubsetFonts=/g) ?? []).length, 1)
  assert.equal(Object.keys(zip.files).filter((name) => name.startsWith('ppt/fonts/') && name.endsWith('.fntdata')).length, 4)

  const roundTrip = await importPptx(fileFromBytes('Customer-Feedback-roundtrip.pptx', exportedBytes))
  assert.equal(roundTrip.slides.length, source.slides.length)
  assert.deepEqual([roundTrip.slideWidth, roundTrip.slideHeight], [source.slideWidth, source.slideHeight])
  assert.equal(roundTrip.embeddedFonts?.[0]?.fontFamily, 'Roboto Mono')
  assert.deepEqual(roundTrip.embeddedFonts, source.embeddedFonts)

  for (let i = 0; i < source.slides.length; i++) {
    const before = source.slides[i]
    const after = roundTrip.slides[i]
    assert.equal(after.background?.type, 'solid', `slide ${i + 1} background type`)
    assert.equal(after.background?.color, '#212121', `slide ${i + 1} background color`)
    assert.equal(slideText(after), slideText(before), `slide ${i + 1} text`)
    assert.equal(
      after.shapes.filter((shape) => shape.type === 'image').length,
      before.shapes.filter((shape) => shape.type === 'image').length,
      `slide ${i + 1} image count`,
    )
    assert.doesNotMatch(slideText(after), /\[object Object\]/, `slide ${i + 1} corrupt text`)
  }

  console.log('Customer Feedback 27-slide export/re-import checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
