import puppeteer from 'puppeteer'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1500, height: 950 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push('CONSOLE: ' + msg.text())
  })
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 60000 })
  await sleep(2500)
  await page.screenshot({ path: '/tmp/opencode-smoke/t1-init.png' })

  const report = {}
  report.canvasObjCount = await page.evaluate(() => {
    const c = window.__editorCanvas
    return c ? c.getObjects().length : -1
  })
  report.textRendered = await page.evaluate(() => {
    const c = window.__editorCanvas
    // the default intro slide has text; check a Textbox exists
    return c ? c.getObjects().some((o) => o.get('type') === 'i-text' || o.get('type') === 'textbox') : false
  })

  // select second slide
  const thumbs = await page.$$('.slide-thumb')
  await thumbs[1].click()
  await sleep(600)

  // select the chevron-ish shape? click center-ish of a shape: click at 30% of the slide
  const frame = await page.$('.slide-frame')
  const bb = await frame.boundingBox()
  await page.mouse.click(bb.x + bb.width * 0.4, bb.y + bb.height * 0.45)
  await sleep(400)
  report.selectedOne = await page.evaluate(() => {
    const c = window.__editorCanvas
    const a = c.getActiveObjects()
    return a.length === 1
  })
  await page.screenshot({ path: '/tmp/opencode-smoke/t2-select.png' })

  // arrow-move the selected shape
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await sleep(400)
  report.moved = await page.evaluate(() => {
    const st = window.__useEditor?.getState ? null : null
    return st
  })
  // duplicate via menu Format > Duplicate
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Format'))
    b?.click()
  })
  await sleep(250)
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu-item')]
    const d = items.find((x) => x.textContent.includes('Duplicate') && !x.textContent.includes('slide'))
    d?.click()
  })
  await sleep(500)
  report.duplicated = await page.evaluate(() => {
    const c = window.__editorCanvas
    return c ? c.getObjects().length : -1
  })

  // undo (should remove the duplicate)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('title') === 'Undo (⌘Z)')
    b?.click()
  })
  await sleep(500)
  report.undone = await page.evaluate(() => {
    const c = window.__editorCanvas
    return c ? c.getObjects().length : -1
  })
  await page.screenshot({ path: '/tmp/opencode-smoke/t3-undone.png' })

  // double click text on slide 3 to edit
  await thumbs[2].click()
  await sleep(500)
  const frame3 = await page.$('.slide-frame')
  const bb3 = await frame3.boundingBox()
  await page.mouse.click(bb3.x + bb3.width * 0.38, bb3.y + bb3.height * 0.14)
  await page.mouse.click(bb3.x + bb3.width * 0.38, bb3.y + bb3.height * 0.14, { clickCount: 2 })
  await sleep(600)
  const editing = await page.evaluate(() => {
    const c = window.__editorCanvas
    const a = c?.getActiveObject()
    return a && a.isEditing ? 'editing' : a ? a.get('text') ?? a.type : 'none'
  })
  report.textEditing = editing
  if (editing === 'editing') {
    await page.keyboard.down('Meta')
    await page.keyboard.press('KeyA')
    await page.keyboard.up('Meta')
    await page.keyboard.type('EDITED TITLE')
    await page.keyboard.press('Escape')
    await sleep(800)
  }
  report.textAfterEdit = await page.evaluate(() => {
    const st = window.__storeGet ? null : null
    return st
  })

  // verify via store: read the deck from the DOM? expose store getter
  await page.evaluate(() => {
    window.__getDeck = () => {
      const slidesEls = document.querySelectorAll('.slide-thumb').length
      return slidesEls
    }
  })
  report.slideCount = await page.evaluate(() => window.__getDeck())
  await page.screenshot({ path: '/tmp/opencode-smoke/t4-edited.png' })

  // present mode
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Present'))
    b?.click()
  })
  await sleep(1200)
  report.presentActive = await page.$('.presentation-overlay') ? true : false
  await page.keyboard.press('ArrowRight')
  await sleep(1200)
  await page.screenshot({ path: '/tmp/opencode-smoke/t5-present.png' })
  await page.keyboard.press('Escape')
  await sleep(400)

  // export (blob download happens client-side; count blob URL creation)
  report.exported = await page.evaluate(async () => {
    const orig = URL.createObjectURL
    const origClick = HTMLAnchorElement.prototype.click
    let created = null
    URL.createObjectURL = (blob) => {
      created = blob
      return 'blob:tmp'
    }
    HTMLAnchorElement.prototype.click = () => {}
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('File'))
    b?.click()
    await new Promise((r) => setTimeout(r, 250))
    const items = [...document.querySelectorAll('.menu-item')]
    const d = items.find((x) => x.textContent.includes('Download .pptx'))
    d?.click()
    await new Promise((r) => setTimeout(r, 2500))
    URL.createObjectURL = orig
    HTMLAnchorElement.prototype.click = origClick
    if (!created) return 'no blob'
    if (!(created instanceof Blob)) return 'not a blob'
    const b2 = await created.slice(0, 64).text()
    return 'blob:' + b2.charCodeAt(0) + ' size ' + created.size
  })

  console.log(JSON.stringify(report, null, 2))
  console.log('ERRORS:', errors.length ? errors.slice(0, 12).join('\n') : 'none')
  await browser.close()
}
main().catch((e) => {
  console.error('BROWSER TEST FAIL:', e)
  process.exit(1)
})