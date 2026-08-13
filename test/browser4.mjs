import puppeteer from 'puppeteer'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1500, height: 950 })
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await sleep(1500)

  const thumbs = await page.$$('.slide-thumb')
  await thumbs[1].click()
  await sleep(700)

  // click likely the ellipse at slide2: (300..450, 180..300)
  await page.evaluate(() => {
    window.__selEvts = []
    window.__editorCanvas?.on('selection:updated', () => {
      window.__selEvts.push('fired')
    })
    window.__selCreated = null
    window.__editorCanvas?.on('selection:created', () => {
      window.__selCreated = 'created'
    })
  })
  const frame = await page.$('.slide-frame')
  const bb = await frame.boundingBox()
  await page.mouse.click(bb.x + 370, bb.y + 240)
  await sleep(500)

  const before = await page.evaluate(() => {
    const c = window.__editorCanvas
    const act = c?.getActiveObjects() ?? []
    const st = window.__useEditorState()
    return {
      objects: c ? c.getObjects().length : -1,
      active: act.map((o) => `${o.get('type')}/${o.meta?.shapeId ?? '?'}/${o.meta?.kind ?? '?'}`),
      shapes: window.__useEditorGetDeck().slides.map((s) => s.shapes.length),
      selIds: st.selectedShapeIds,
      selEvts: window.__selEvts,
      selCreated: window.__selCreated,
      selId: st.selectedSlideId,
      selIsInSlide: st.selectedSlideId ? st.deck.slides.find((s) => s.id === st.selectedSlideId)?.shapes.some((sh) => st.selectedShapeIds.includes(sh.id)) : 'no-slide',
    }
  })
  console.log('BEFORE', JSON.stringify(before))

  const afterDup = await page.evaluate(() => {
    window.__useEditorState().duplicateSelected()
    return window.__useEditorGetDeck().slides.map((s) => s.shapes.length)
  })
  await sleep(700)
  const canvasAfterDup = await page.evaluate(() => {
    const c = window.__editorCanvas
    return c ? c.getObjects().length : -1
  })
  console.log('AFTER DUP deck shapes', JSON.stringify(afterDup), 'canvas objects', canvasAfterDup)

  await page.evaluate(() => window.__useEditorState().undo())
  await sleep(700)
  const canvasAfterUndo = await page.evaluate(() => {
    const c = window.__editorCanvas
    return c ? c.getObjects().length : -1
  })
  console.log('AFTER UNDO canvas objects', canvasAfterUndo)
  console.log('ERRORS:', errs.join('\n') || 'none')
  await browser.close()
}
main()