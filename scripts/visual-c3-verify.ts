// Visual capture for C.3 (gold-400 -> gold-800 contrast fix).
// Surfaces touched: /categories/[slug] eyebrows, /pricing badges + FAQ
// link, Prose links on /legal/terms and /help.
// Captures AFTER state at 7 mobile + tablet + desktop viewports so Lawal
// can eyeball the colour shift intent vs unintended layout drift.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const PREVIEW_URL =
  process.env.PREVIEW_URL ?? 'https://eventlinqs-53u64e0zc-lawals-projects-c20c0be8.vercel.app'
const OUT_DIR = 'docs/sprint1/phase-1b/iter-10-pt4-d-warm/visual-c3'

mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: 'mobile-sm',     w: 375,  h: 667  },
  { name: 'mobile-md',     w: 390,  h: 844  },
  { name: 'mobile-lg',     w: 414,  h: 896  },
  { name: 'tablet-port',   w: 768,  h: 1024 },
  { name: 'tablet-land',   w: 1024, h: 768  },
  { name: 'desktop',       w: 1280, h: 800  },
  { name: 'desktop-wide',  w: 1920, h: 1080 },
]

const ROUTES = [
  ['category',    '/categories/afrobeats'],
  ['pricing',     '/pricing'],
  ['legal-terms', '/legal/terms'],
  ['help',        '/help'],
]

async function run() {
  const browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.w <= 414 ? 3 : 2,
      isMobile: vp.w <= 414,
    })
    for (const [label, path] of ROUTES) {
      const page = await ctx.newPage()
      try {
        await page.goto(PREVIEW_URL + path, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.screenshot({
          path: `${OUT_DIR}/${vp.name}--${label}.png`,
          fullPage: true,
        })
        console.log('captured', vp.name, label)
      } catch (e) {
        console.log('skip', vp.name, label, (e as Error).message.slice(0, 80))
      }
      await page.close()
    }
    await ctx.close()
  }
  await browser.close()
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
