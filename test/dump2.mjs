import { readFileSync } from 'fs'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  textNodeName: '_',
  parseTagValue: false,
  isArray: (name) =>
    [
      'sp', 'pic', 'cxnSp', 'graphicFrame', 'grpSp', 'p', 'r', 'br', 't', 'txBody',
      'gradStop', 'bg', 'ph', 'defRPr', 'rPr', 'latin', 'solidFill', 'gradFill', 'noFill',
      'ln', 'effectLst', 'outerShdw', 'alpha', 'pPr', 'buNone', 'buChar', 'buAutoNum',
      'lnSpc', 'spcBef', 'spcAft', 'spcPct', 'spcPts', 'blipFill', 'blip', 'xfrm', 'off',
      'ext', 'chOff', 'chExt', 'sldIdLst', 'sldId', 'gsLst', 'gs', 'headEnd', 'tailEnd',
      'prstDash', 'a', 'b', 'i', 'u', 'strike', 'algn', 'lvl', 'cNvPr', 'cNvSpPr',
      'prstGeom', 'sldLayoutId', 'note', 'whole', 'ndLst', 'nvSpPr', 'nvPicPr', 'nvCxnSpPr',
      'bgPr', 'bgRef', 'highlight', 'txPr', 'wrap', 'anchor', 'spAutoFit', 'normAutofit',
    ].includes(name),
})
const buf = readFileSync('/Users/flrnst/Developer/Experiments/pptx-editor-react/example-data/Extlst-test.pptx')
const zip = await JSZip.loadAsync(buf)
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const doc = parser.parse(xml)
const sld = doc.sld ?? doc.presentation_sld
const tree = sld?.cSld?.[0]?.spTree?.[0] ?? sld?.cSld?.spTree
console.log('root keys:', Object.keys(doc))
console.log('cSld is arr:', Array.isArray(sld?.cSld), 'spTree is arr:', Array.isArray(tree))
if (tree) {
  console.log('spTree keys:', Object.keys(tree))
  console.log('sp count:', (tree.sp ?? []).length)
  console.log('first sp keys:', Object.keys((tree.sp ?? [])[0] ?? {}))
  const prst = (tree.sp ?? [])[0]
  console.log('prstGeom:', JSON.stringify(prst?.prstGeom?.[0]?.['@_prst']))
  console.log('spPr keys:', Object.keys(prst?.spPr?.[0] ?? {}))
  console.log('xfrm off:', JSON.stringify(prst?.spPr?.[0]?.xfrm?.[0]?.off?.[0]))
  console.log('ext:', JSON.stringify(prst?.spPr?.[0]?.xfrm?.[0]?.ext?.[0]))
}