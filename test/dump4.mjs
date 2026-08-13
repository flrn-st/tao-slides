import { readFileSync } from 'fs'
import JSZip from 'jszip'

async function main() {
  const buf = readFileSync('/tmp/opencode-smoke/gen.pptx')
  const zip = await JSZip.loadAsync(buf)
  const names = []
  zip.forEach((p) => names.push(p))
  console.log('entries:', names.filter((n) => /notes|slide/.test(n)).join('\n'))
  const notes = await zip.file('ppt/notesSlides/notesSlide1.xml')?.async('string')
  console.log('\nnotesSlide1 exists:', !!notes)
  if (notes) console.log(notes.slice(0, 900))
}
main()