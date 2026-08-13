import puppeteer from 'puppeteer'
import { readFileSync } from 'fs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1500, height: 950 })
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await sleep(1500)

  // 1. edit text on slide 1 (change 'Welcome to Slides')
  await page.evaluate(() => window.__useEditorState().selectSlide(window.__useEditorGetDeck().slides[0].id))
  await sleep(800)
  const frame = await page.$('.slide-frame')
  const bb = await frame.boundingBox()
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.35)
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.35, { clickCount: 2 })
  await sleep(600)
  await page.keyboard.down('Meta')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Meta')
  await page.keyboard.type('Edited in headless chrome')
  await page.keyboard.press('Escape')
  await page.mouse.click(bb.x + 10, bb.y + 10)
  await sleep(800)

  const textState = await page.evaluate(() => {
    const slide = window.__useEditorGetDeck().slides[0]
    const t = slide.shapes.find((s) => s.type === 'text')
    return t ? t.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('/') : 'no text'
  })
  console.log('text persisted:', JSON.stringify(textState))

  // 2. keyboard: select all → delete
  await page.evaluate(() => {
    window.__useEditorState().selectSlide(window.__useEditorGetDeck().slides[2].id)
  })
  await sleep(700)
  await page.evaluate(() => {
    window.__editorCanvas.discardActiveObject()
  })
  await page.keyboard.down('Meta')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Meta')
  await sleep(300)
  const selAll = await page.evaluate(() => window.__useEditorState().selectedShapeIds.length)
  console.log('ctrl+A selects:', selAll)
  await page.keyboard.press('Delete')
  await sleep(600)
  const afterDel = await page.evaluate(() => window.__useEditorGetDeck().slides[2].shapes.length)
  console.log('after Delete, slide-3 shapes:', afterDel)

  // undo restores
  await page.keyboard.down('Meta')
  await page.keyboard.press('KeyZ')
  await page.keyboard.up('Meta')
  await sleep(600)
  const afterUndo = await page.evaluate(() => window.__useEditorGetDeck().slides[2].shapes.length)
  console.log('after undo, slide-3 shapes:', afterUndo)

  // 3. import a real pptx via the file input
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('File'))
    b?.click()
  })
  await sleep(200)
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu-item')]
    items.find((x) => x.textContent.includes('Import .pptx'))?.click()
  })
  await sleep(300)
  const input = await page.$('input[type="file"]')
  await input.uploadFile('/Users/flrnst/Developer/Experiments/pptx-editor-react/example-data/Extlst-test.pptx')
  await sleep(4000)
  const imported = await page.evaluate(() => {
    const d = window.__useEditorGetDeck()
    return { slides: d.slides.length, title: d.title, shapes: d.slides[0].shapes.length }
  })
  console.log('imported:', JSON.stringify(imported))
  await page.screenshot({ path: '/tmp/opencode-smoke/final-import.png' })

  console.log('ERRORS:', errs.join('\n') || 'none')
  await browser.close()
}
main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})