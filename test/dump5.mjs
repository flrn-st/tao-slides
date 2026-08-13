import { readFileSync } from 'fs'
import JSZip from 'jszip'

async function main() {
  const buf = readFileSync('/tmp/opencode-smoke/gen.pptx')
  const zip = await JSZip.loadAsync(buf)
  const s1 = await zip.file('ppt/slides/slide1.xml').async('string')
  const lineIdx = s1.indexOf('line')
  console.log('--- slide1 around "line" ---')
  console.log(s1.slice(Math.max(0, lineIdx - 300), lineIdx + 500))
  const n = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string')
  const tIdx = n.indexOf('<a:t')
  console.log('\n--- notes1 around <a:t ---')
  console.log(n.slice(Math.max(0, tIdx - 600), tIdx + 300))
}
main()