import PptxGenJS from 'pptxgenjs'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const cases = [
  ['shape-grad', (s) => { s.addShape('rect', { x: 1, y: 1, w: 2, h: 2, fill: { type: 'gradient', angle: 45, stops: [{ position: 0, color: '1A73E8' }, { position: 100, color: '9C72E8' }] } }) }],
  ['gradient-bg', (s) => { s.background = { fill: { type: 'gradient', angle: 45, stops: [{ position: 0, color: '1A73E8' }, { position: 100, color: '9C72E8' }] } } }],
  ['runs', (s) => { s.addText([{ text: 'Hello ', options: { bold: true } }, { text: 'World', options: { italic: true, color: 'FF0000' } }, { text: '!', options: { fontSize: 48 } }], { x: 1, y: 1, w: 8, h: 1, fontSize: 24, fontFace: 'Arial' }) }],
  ['roundRect+shadow', (s) => { s.addShape('roundRect', { x: 1, y: 2.5, w: 3, h: 1.5, fill: { color: '34A853' }, line: { color: '000000', width: 2, dashType: 'dash' }, shadow: { type: 'outer', color: '000000', blur: 6, offset: 3, angle: 45, opacity: 50 } }) }],
  ['rect-text', (s) => { s.addShape('roundRect', { x: 1, y: 2.5, w: 3, h: 1.5, fill: { color: '34A853' }, text: [{ text: 'Rounded', options: { bold: true, color: 'FFFFFF' } }] }) }],
  ['ellipse', (s) => { s.addShape('ellipse', { x: 4.5, y: 2.5, w: 1.5, h: 1.5, fill: { color: 'F9AB00' } }) }],
  ['rightArrow', (s) => { s.addShape('rightArrow', { x: 6.5, y: 2.8, w: 2.5, h: 0.9, fill: { color: 'EA4335' } }) }],
  ['image', (s) => { s.addImage({ data: png, x: 1, y: 4.5, w: 2, h: 2, sizing: { type: 'cover', w: 2, h: 2 } }) }],
  ['notes', (s) => { s.addNotes('Speaker notes go here!') }],
  ['hline', (s) => { s.addShape('line', { x: 1, y: 6.9, w: 8, h: 0, line: { color: '000000', width: 2 } }) }],
  ['diagline+rotate', (s) => { s.addShape('line', { x: 1, y: 6.9, w: 2, h: 1, line: { color: '333333', width: 3 }, rotate: 30 }) }],
  ['bullets', (s) => { s.addText('• bullet one\n• bullet two', { x: 5, y: 4.5, w: 4, h: 1.5, bullet: { characterCode: '2022' } }) }],
  ['pentagon', (s) => { s.addShape('pentagon', { x: 3, y: 2, w: 2, h: 2, fill: { color: '9C27B0' } }) }],
  ['heart', (s) => { s.addShape('heart', { x: 6, y: 2, w: 2, h: 2, fill: { color: 'E91E63' } }) }],
]

async function main() {
for (const [name, fn] of cases) {
  const p = new PptxGenJS()
  try {
    p.defineLayout({ name: 'T', width: 10, height: 7.5 })
    p.layout = 'T'
    const s = p.addSlide()
    fn(s)
    await p.write({ outputType: 'arraybuffer' })
    console.log('OK  ', name)
  } catch (e) {
    console.log('FAIL', name, '-', e.message)
  }
}
}
main()