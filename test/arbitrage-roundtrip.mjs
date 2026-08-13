import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { importPptx } from '../src/lib/importPptx.ts'
import { exportPptx } from '../src/lib/exportPptx.ts'

const textOf = (shape) => shape.paragraphs
  ?.map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
  .join('\n') ?? ''

async function main() {
  const bytes = await readFile('example-data/Arbitrage.pptx')
  const source = await importPptx({
    name: 'Arbitrage.pptx',
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  const blob = await exportPptx(source)
  const exported = Buffer.from(await blob.arrayBuffer())
  await writeFile('tmp/Arbitrage-roundtrip.pptx', exported)

  const result = await importPptx({
    name: 'Arbitrage-roundtrip.pptx',
    arrayBuffer: async () => exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength),
  })

  assert.equal(result.slides.length, 19)
  assert.deepEqual([result.slideWidth, result.slideHeight], [960, 540])
  assert.equal(result.slides[0].shapes.length, 1)
  assert.equal(result.slides[0].shapes[0].type, 'image')
  assert.deepEqual(
    [result.slides[0].shapes[0].x, result.slides[0].shapes[0].y, result.slides[0].shapes[0].width, result.slides[0].shapes[0].height],
    [0, 0, 960, 540],
  )

  const nativeSlide = result.slides[14]
  assert.equal(nativeSlide.background.type, 'solid')
  assert.equal(nativeSlide.background.color, '#000000')
  assert.ok(nativeSlide.shapes.some((shape) => shape.type === 'rtArrow'))
  const offer = nativeSlide.shapes.find((shape) => textOf(shape).includes('Pool #1'))
  assert.ok(offer)
  assert.equal(offer.type, 'rect')
  assert.equal(offer.fill.transparency, 100)
  assert.equal(offer.stroke.color, '#B7B7B7')
  assert.equal(offer.x, 203)
  assert.equal(offer.y, 78)
  assert.ok(nativeSlide.shapes.some((shape) => textOf(shape).includes('Asset A and Asset B')))

  console.log(`Arbitrage 19-slide round trip passed (${exported.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
