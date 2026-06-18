import { chromium } from 'playwright'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const targets = [
  ['TM-home', 'https://www.ticketmaster.com.au/'],
  ['TM-discover', 'https://www.ticketmaster.com.au/discover/concerts'],
  ['EB-home', 'https://www.eventbrite.com.au/'],
  ['EB-browse', 'https://www.eventbrite.com.au/d/australia--sydney/all-events/'],
]
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] })
for (const [n, url] of targets) {
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, locale: 'en-AU' })
    const p = await ctx.newPage()
    const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await p.waitForTimeout(4500)
    const html = await p.content()
    const title = (await p.title()).slice(0, 70)
    const blocked = /captcha|are you a robot|access denied|pardon the interruption|px-captcha|datadome|unusual traffic/i.test(html)
    console.log(`${n}: status=${r.status()} blocked=${blocked} htmlLen=${html.length} title="${title}"`)
    await ctx.close()
  } catch (e) { console.log(`${n}: ERROR ${e.message.slice(0, 90)}`) }
}
await b.close()
