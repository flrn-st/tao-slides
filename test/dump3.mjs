import { readFileSync } from 'fs'
import JSZip from 'jszip'

const buf = readFileSync('/Users/flrnst/Developer/Experiments/pptx-editor-react/example-data/Extlst-test.pptx')
const zip = await JSZip.loadAsync(buf)
const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
console.log('slide rels:', rels.slice(0, 600))
const entry = zip.file('ppt/slideLayouts/slideLayout1.xml')
console.log('\nlayout exists:', !!entry)
if (entry) {
  const lx = await entry.async('string')
  console.log('layout head:', lx.slice(0, 400))
  const m = lx.match(/<p:bg>[\s\S]{0,800}/)
  console.log('\nbg segment:', m ? m[0].slice(0, 500) : 'NO p:bg FOUND')
}
const masterPath = Object.keys(await (await (async () => { }))()).length ? '' : ''
void masterPath