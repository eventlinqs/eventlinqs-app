// Image-spine QA: capture every surface the 56-image spine renders into, at
// desktop 1440 and mobile 390, against a PRODUCTION server (pass BASE as argv2).
// Full-page captures per surface so each hero/tile placement is visible for the
// "no subject cut, no distortion, no letterboxing" review.
// Output -> docs/benchmark/system-pass/image-spine/<viewport>/<label>.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Surfaces that render spine slots. Heroes + the homepage rails (cities,
// sounds, community, categories) + a wired community landing.
const SURFACES = [
  { label: 'home', path: '/' },
  { label: 'organisers', path: '/organisers' },
  { label: 'cities-index', path: '/cities' },
  { label: 'communities-index', path: '/communities' },
  { label: 'city-sydney', path: '/city/sydney' },
  { label: 'city-melbourne', path: '/city/melbourne' },
  { label: 'browse-brisbane', path: '/events/browse/brisbane' },
  // General categories render as homepage TILES + browse via /events?category=;
  // /categories/[slug] is the community hero-category route (still on bundled art).
  { label: 'community-first-nations', path: '/community/aboriginal-torres-strait-islander' },
  { label: 'community-indian', path: '/community/indian' },
  { label: 'community-chinese', path: '/community/chinese' },
  { label: 'community-italian', path: '/community/italian' },
  { label: 'community-pacific', path: '/community/pacific-pasifika' },
]

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900, dsf: 1.5 },
  { name: '390', w: 390, h: 844, dsf: 2 },
]

const b = await chromium.launch({ args: ['--no-sandbox'] })
for (const vp of VIEWPORTS) {
  const OUT = `docs/benchmark/system-pass/image-spine/${vp.name}`
  mkdirSync(OUT, { recursive: true })
  const ctx = await b.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dsf,
    userAgent: UA,
  })
  // headless audit flag so motion/autoplay are off and crops are stable.
  await ctx.addInitScript(() => { document.documentElement.setAttribute('data-headless', '1') })
  const p = await ctx.newPage()
  for (const s of SURFACES) {
    try {
      await p.goto(BASE + s.path, { waitUntil: 'networkidle', timeout: 90000 })
      await p.waitForTimeout(900)
      // settle lazy images: scroll to bottom then back to top.
      await p.evaluate(async () => {
        const h = document.body.scrollHeight
        for (let y = 0; y <= h; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
        window.scrollTo(0, 0)
      })
      await p.waitForTimeout(700)
      await p.screenshot({ path: `${OUT}/${s.label}.png`, fullPage: true })
      console.log(`${vp.name}  ${s.label}  OK`)
    } catch (e) {
      console.log(`${vp.name}  ${s.label}  FAIL ${e.message}`)
    }
  }
  await ctx.close()
}
await b.close()
console.log('done')
