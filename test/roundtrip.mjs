import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { exportPptx } from '../src/lib/exportPptx.ts'
import { importPptx } from '../src/lib/importPptx.ts'

const deck = {
  title: 'geometry round trip',
  slideWidth: 960,
  slideHeight: 540,
  slides: [{
    id: 'slide-1',
    background: { type: 'solid', color: '#FFFFFF' },
    notes: '',
    shapes: [
      {
        id: 'gradient', type: 'rect', x: 96, y: 48, width: 192, height: 96,
        rotation: 0, opacity: 100,
        fill: { type: 'gradient', angle: 90, stops: [
          { color: '#FF0000', position: 0 },
          { color: '#0000FF', position: 100 },
        ] },
      },
      {
        id: 'transparent', type: 'ellipse', x: 384, y: 48, width: 96, height: 96,
        rotation: 0, opacity: 100,
      },
      {
        id: 'line', type: 'line', x1: 96, y1: 288, x2: 384, y2: 192,
        opacity: 100, stroke: { color: '#123456', width: 2 }, arrowEnd: true,
      },
    ],
  }],
}

async function main() {
const blob = await exportPptx(deck)
const zip = await JSZip.loadAsync(await blob.arrayBuffer())
const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')

// The model's 96 px must be serialized as one inch (914400 EMU), not 96 inches.
assert.match(slideXml, /<a:off x="914400" y="457200"\/?>/)
assert.match(slideXml, /<a:ext cx="1828800" cy="914400"\/?>/)
assert.match(slideXml, /<a:srgbClr val="FF0000"/)
assert.match(slideXml, /<a:tailEnd type="triangle"\/>/)

const roundTrip = await importPptx({
  name: 'roundtrip.pptx',
  arrayBuffer: () => blob.arrayBuffer(),
})
const shapes = roundTrip.slides[0].shapes
const gradient = shapes.find((shape) => shape.type === 'rect')
const transparent = shapes.find((shape) => shape.type === 'ellipse')
const line = shapes.find((shape) => shape.type === 'line')

assert.ok(gradient)
assert.equal(gradient.x, 96)
assert.equal(gradient.y, 48)
assert.equal(gradient.width, 192)
assert.equal(gradient.height, 96)
assert.equal(gradient.fill.type, 'solid')
assert.equal(gradient.fill.color, '#FF0000')
assert.ok(transparent)
assert.equal(transparent.fill.transparency, 100)
assert.ok(line)
assert.deepEqual([line.x1, line.y1, line.x2, line.y2], [96, 288, 384, 192])
assert.equal(line.arrowEnd, true)

console.log('PPTX geometry round-trip checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
