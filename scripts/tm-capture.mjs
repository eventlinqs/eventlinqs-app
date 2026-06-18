import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('qa/competitor', { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const browser = await chromium.launch({ args:['--no-sandbox'] })
for (const vp of [{n:'1440',w:1440,h:900},{n:'390',w:390,h:844}]) {
  try {
    const ctx = await browser.newContext({ viewport:{width:vp.w,height:vp.h}, deviceScaleFactor:2, userAgent:UA, locale:'en-AU' })
    const page = await ctx.newPage()
    await page.goto('https://www.ticketmaster.com.au/', { waitUntil:'domcontentloaded', timeout:45000 })
    await page.waitForTimeout(5000)
    await page.screenshot({ path:`qa/competitor/tm-${vp.n}-fold.png` })
    console.log('captured TM', vp.n, '-> title:', (await page.title()).slice(0,60))
    await ctx.close()
  } catch(e){ console.log('FAIL TM', vp.n, e.message.slice(0,80)) }
}
await browser.close()
