import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/legacy-purge/competitor'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const TARGETS = [
  { slug: 'eventbrite', url: 'https://www.eventbrite.com.au/' },
  { slug: 'ticketmaster', url: 'https://www.ticketmaster.com.au/' },
]
for (const t of TARGETS) {
  const b = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' })
  const page = await ctx.newPage()
  try {
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `${OUT}/${t.slug}-1440-full.png`, fullPage: true })
    console.log(`ok ${t.slug}`)
  } catch (e) { console.log(`FAIL ${t.slug}: ${e.message}`) }
  await b.close()
}
console.log('done')
