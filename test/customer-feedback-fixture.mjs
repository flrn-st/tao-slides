import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { importPptx } from '../src/lib/importPptx.ts'

async function main() {
  const name = 'Customer Feedback Analysis _at Scale.pptx'
  const bytes = await readFile(`example-data/${name}`)
  const deck = await importPptx({
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })

  assert.equal(deck.slides.length, 27)
  assert.deepEqual([deck.slideWidth, deck.slideHeight], [960, 540])
  assert.equal(deck.theme?.colors.dk1, 'FFFFFF')
  assert.equal(deck.theme?.colors.lt1, '212121')
  assert.equal(deck.theme?.majorFont, 'Arial')
  assert.equal(deck.theme?.minorFont, 'Arial')
  for (const slide of deck.slides) {
    assert.equal(slide.background?.type, 'solid')
    assert.equal(slide.background?.color, '#212121')
  }
  const title = deck.slides[0].shapes[0]
  assert.equal(title.paragraphs?.[0]?.runs[0]?.fontFamily, 'Roboto Mono')
  assert.equal(title.paragraphs?.[0]?.runs[0]?.color, 'FFFFFF')
  assert.deepEqual(
    title.paragraphs?.map((paragraph) => paragraph.runs.map((run) => run.text).join('')),
    ['Customer Feedback Analysis ', 'at Scale'],
  )
  const problemBullet = deck.slides[3].shapes[1].paragraphs?.[0]
  assert.equal(Math.round(problemBullet?.marginLeft ?? 0), 36)
  assert.equal(Math.round(problemBullet?.firstLineIndent ?? 0), -27)
  assert.equal(deck.slides[1].shapes[1].fontScale, 0.925)

  console.log('Customer Feedback 27-slide fixture checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
