import { readFileSync } from 'fs'
import puppeteer from 'puppeteer'

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text())
  })
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 2500))
  await page.screenshot({ path: '/tmp/opencode-smoke/1-initial.png' })

  // click first slide thumb (selects slide)
  await page.waitForSelector('.slide-thumb', { timeout: 10000 })
  const thumbs = await page.$$('.slide-thumb')
  console.log('thumbnails:', thumbs.length)
  await thumbs[1].click()
  await new Promise((r) => setTimeout(r, 800))

  // select a shape on the canvas (click center)
  const slideFrame = await page.$('.slide-frame')
  const bb = await slideFrame.boundingBox()
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5)
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: '/tmp/opencode-smoke/2-selected.png' })

  // add a new slide via toolbar insert menu
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const insert = btns.find((b) => b.textContent.includes('Insert'))
    insert?.click()
  })
  await new Promise((r) => setTimeout(r, 300))
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.menu-item')]
    const tbox = btns.find((b) => b.textContent.includes('Text box'))
    tbox?.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  await page.screenshot({ path: '/tmp/opencode-smoke/3-textbox.png' })

  // present mode
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const present = btns.find((b) => b.textContent.includes('Present'))
    present?.click()
  })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: '/tmp/opencode-smoke/4-present.png' })
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 400))

  // undo/redo
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const file = btns.find((b) => b.textContent.includes('File'))
    file?.click()
    setTimeout(() => {
      const items = [...document.querySelectorAll('.menu-item')]
      const exp = items.find((b) => b.textContent.includes('Download .pptx'))
      exp?.click()
    }, 100)
  })
  await new Promise((r) => setTimeout(r, 4000))

  await page.screenshot({ path: '/tmp/opencode-smoke/5-final.png' })
  console.log('ERRORS:', errors.length ? errors.slice(0, 10).join('\n') : 'none')
  await browser.close()
}
main().catch((e) => {
  console.error('BROWSER TEST FAIL:', e)
  process.exit(1)
})