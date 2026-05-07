import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.setViewportSize({ width: 375, height: 812 })
await page.goto('http://localhost:3002/city/sydney', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
await page.waitForTimeout(1500)
const data = await page.evaluate(() => {
  const body = document.body
  const html = document.documentElement
  const cs = getComputedStyle(body)
  return {
    bodyOverflowX: cs.overflowX,
    bodyW: body.scrollWidth,
    htmlW: html.scrollWidth,
    htmlOverflowX: getComputedStyle(html).overflowX,
  }
})
console.log(JSON.stringify(data, null, 2))

// Find the widest element
const widest = await page.evaluate(() => {
  const all = document.querySelectorAll('*')
  let max = 0
  let info = null
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.right > max) {
      max = r.right
      info = { tag: el.tagName, cls: (el.className || '').toString().slice(0, 100), right: Math.round(r.right), pos: getComputedStyle(el).position }
    }
  }
  return info
})
console.log('WIDEST:', JSON.stringify(widest))
await browser.close()
