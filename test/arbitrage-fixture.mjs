import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { importPptx } from '../src/lib/importPptx.ts'

async function main() {
  const bytes = await readFile('example-data/Arbitrage.pptx')
  const deck = await importPptx({
    name: 'Arbitrage.pptx',
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })

  assert.equal(deck.slides.length, 19)
  const intro = deck.slides[7].shapes[0]
  assert.equal(intro.type, 'text')
  assert.equal(intro.paragraphs[0].align, 'center')
  assert.equal(
    intro.paragraphs[0].runs.map((run) => run.text).join(''),
    'Say we have 2 Liquidity Pools with two types of assets: Asset A and Asset B:',
  )
  assert.equal(intro.stroke, undefined)

  const offer = deck.slides[14].shapes.find((shape) => shape.name === 'Google Shape;139;p17')
  assert.ok(offer)
  assert.equal(offer.type, 'rect')
  assert.equal(offer.stroke.color, '#B7B7B7')

  const arrow = deck.slides[12].shapes.find((shape) => shape.name === 'Google Shape;114;p15')
  assert.ok(arrow)
  assert.equal(arrow.type, 'rtArrow')
  assert.ok(Math.abs(arrow.rotation - 60.0075) < 0.01)

  console.log('Arbitrage fixture import checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
