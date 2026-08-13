import puppeteer from 'puppeteer'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1500, height: 950 })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  for (const t of [1000, 2500, 5000]) {
    await sleep(t - (t === 1000 ? 0 : (t === 2500 ? 1000 : 2500)))
    const info = await page.evaluate(() => {
      const c = window.__editorCanvas
      const el = document.querySelector('.slide-frame canvas')
      return {
        hasCanvas: !!c,
        count: c ? c.getObjects().length : 'none',
        w: el?.width,
        h: el?.height,
        cssW: el ? el.clientWidth : 0,
        slideThumbs: document.querySelectorAll('.slide-thumb').length,
      }
    })
    console.log(`t=${t}`, JSON.stringify(info))
  }
  console.log('ERRORS:', errors.join('\n') || 'none')
  await browser.close()
}
main()