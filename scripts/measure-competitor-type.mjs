import { chromium, devices } from 'playwright'
const TARGETS = [
  { slug: 'ticketmaster', url: 'https://www.ticketmaster.com.au/' },
  { slug: 'eventbrite', url: 'https://www.eventbrite.com.au/' },
]
const VPS = [
  { tag: '1440', width: 1440, height: 900, mobile: false },
  { tag: '390', mobile: true },
]
function px(s){ return Math.round(parseFloat(s)*10)/10 }
for (const t of TARGETS) {
  for (const vp of VPS) {
    const b = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
    const ctx = vp.mobile ? await b.newContext({ ...devices['iPhone 13'] })
      : await b.newContext({ viewport:{width:vp.width,height:vp.height}, userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' })
    const page = await ctx.newPage()
    try {
      await page.goto(t.url, { waitUntil:'domcontentloaded', timeout:45000 })
      await page.waitForTimeout(3500)
      const data = await page.evaluate(() => {
        const out = []
        const els = document.querySelectorAll('h1,h2,h3')
        for (const el of els) {
          const txt = (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,38)
          if (!txt) continue
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          if (r.width===0 || r.height===0) continue
          out.push({ tag: el.tagName, fs: cs.fontSize, fw: cs.fontWeight, ls: cs.letterSpacing, lh: cs.lineHeight, tt: cs.textTransform, txt })
        }
        return out.slice(0, 14)
      })
      console.log(`\n### ${t.slug} @ ${vp.tag}`)
      for (const d of data) console.log(`  ${d.tag} ${px(d.fs)}px w${d.fw} ls:${d.ls} lh:${px(d.lh)||d.lh} ${d.tt!=='none'?d.tt:''}  "${d.txt}"`)
    } catch(e){ console.log(`FAIL ${t.slug} ${vp.tag}: ${e.message}`) }
    await b.close()
  }
}
