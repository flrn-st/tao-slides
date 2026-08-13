import { readFileSync } from 'fs'
import JSZip from 'jszip'

const buf = readFileSync('/Users/flrnst/Developer/Experiments/pptx-editor-react/example-data/Extlst-test.pptx')
const zip = await JSZip.loadAsync(buf)
const slideFiles = []
zip.forEach((p, f) => { if (/^ppt\/slides\/slide\d+\.xml$/.test(p)) slideFiles.push(p) })
slideFiles.sort()
console.log('slide files:', slideFiles)
const xml = await zip.file(slideFiles[0]).async('string')
console.log(xml.slice(0, 1500))
console.log('...')
console.log(xml.slice(-800))