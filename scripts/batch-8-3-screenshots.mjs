// Batch 8.3 - venue profile + OP7 wire-up screenshot capture.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-8.3-evidence'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VENUES = [
  'enmore-theatre',          // multiple events (typical state)
  'hordern-pavilion',        // single event (sparse data)
  'luna-park-big-top',       // single event
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
})

async function primeLazy(page) {
  await page.evaluate(async () => {
    const total = document.body.scrollHeight
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 130))
    }
    window.scrollTo(0, total)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 300))
  })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(700)
}

// 6 venue profile captures (3 venues x 1440 + 375).
for (const slug of VENUES) {
  for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '375', w: 375, h: 812 }]) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })
    try {
      console.log(`capture ${slug} @ ${vp.name}`)
      await page.goto(`${BASE}/venues/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await primeLazy(page)
      await page.screenshot({ path: `${OUT}/venue-${slug}-${vp.name}.png`, fullPage: true })
    } catch (e) {
      console.log(`  fail: ${e.message?.slice(0, 100)}`)
    }
    await page.close()
  }
}

// Mobile sticky bar capture on first venue.
{
  const slug = VENUES[0]
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 375, height: 812 })
  try {
    await page.goto(`${BASE}/venues/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/mobile-sticky-bar-${slug}.png`, fullPage: false })
    console.log('mobile sticky bar captured')
  } catch (e) {
    console.log(`sticky fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()
}

// SEO verification on first venue.
{
  const slug = VENUES[0]
  const sp = await ctx.newPage()
  try {
    await sp.goto(`${BASE}/venues/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await sp.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    const seo = await sp.evaluate(() => {
      const meta = Array.from(document.querySelectorAll('head meta')).map(m => ({
        name: m.getAttribute('name'),
        property: m.getAttribute('property'),
        content: m.getAttribute('content'),
      })).filter(x => x.content)
      const titleEl = document.querySelector('head title')
      const canonical = document.querySelector('head link[rel="canonical"]')
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent)
      return {
        title: titleEl?.textContent ?? null,
        canonical: canonical?.getAttribute('href') ?? null,
        meta,
        jsonLd,
      }
    })
    writeFileSync(`${OUT}/seo-verification-${slug}.txt`, [
      `URL: ${BASE}/venues/${slug}`,
      `Title: ${seo.title}`,
      `Canonical: ${seo.canonical}`,
      '',
      '== meta tags ==',
      ...seo.meta.map(m => `  ${m.name ?? m.property}: ${m.content}`),
      '',
      '== Schema.org JSON-LD payloads ==',
      ...seo.jsonLd.map((j, i) => `--- payload ${i + 1} ---\n${j}\n`),
    ].join('\n'), 'utf-8')
    console.log(`SEO verification ${slug} captured`)
  } catch (e) {
    console.log(`seo fail: ${e.message?.slice(0, 100)}`)
  }
  await sp.close()
}

// OP7 wire-up: capture organiser profile showing the new venues rail.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(`${BASE}/organisers/owambe-sydney`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    await page.screenshot({ path: `${OUT}/op7-wireup-after-1440.png`, fullPage: true })
    console.log('OP7 wire-up after captured')
  } catch (e) {
    console.log(`op7 fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()
}

await ctx.close()
await browser.close()
console.log('done')
