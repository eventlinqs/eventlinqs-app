// Batch 8.1 - event detail page screenshot capture.
// - Sample event captures across upcoming/sold-out/cancelled/postponed/past
//   states at 1440 + 375.
// - SEO verification: dump <head> meta tags + Schema.org JSON-LD into
//   docs/redesign/batch-8.1-evidence/seo-verification.txt.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-8.1-evidence'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

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

// Pick the first available published events from /events to use as samples.
async function pickEventSlugs() {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  const slugs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/events/"]'))
    const set = new Set()
    for (const a of links) {
      const href = a.getAttribute('href') ?? ''
      const m = href.match(/^\/events\/([a-z0-9-]+)$/)
      if (m) set.add(m[1])
    }
    return Array.from(set).slice(0, 5)
  })
  await page.close()
  return slugs
}

const slugs = await pickEventSlugs()
console.log(`sampled ${slugs.length} event slugs:`, slugs)

if (slugs.length === 0) {
  console.log('no event slugs found - dev seed may be empty')
} else {
  // Full-page captures of the first 3 events at 1440 + 375.
  for (const slug of slugs.slice(0, 3)) {
    for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '375', w: 375, h: 812 }]) {
      const page = await ctx.newPage()
      await page.setViewportSize({ width: vp.w, height: vp.h })
      try {
        console.log(`capture ${slug} @ ${vp.name}`)
        await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
        await primeLazy(page)
        await page.screenshot({ path: `${OUT}/event-${slug}-${vp.name}.png`, fullPage: true })
      } catch (e) {
        console.log(`  fail: ${e.message?.slice(0, 100)}`)
      }
      await page.close()
    }
  }

  // Sticky purchase rail behavior: capture at top + mid-scroll on 1440 + 375.
  {
    const slug = slugs[0]
    for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '375', w: 375, h: 812 }]) {
      const page = await ctx.newPage()
      await page.setViewportSize({ width: vp.w, height: vp.h })
      try {
        await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
        await primeLazy(page)
        await page.evaluate(() => window.scrollTo(0, 1200))
        await page.waitForTimeout(800)
        await page.screenshot({
          path: `${OUT}/sticky-rail-${slug}-${vp.name}.png`,
          fullPage: false,
        })
        console.log(`sticky rail ${slug} ${vp.name} captured`)
      } catch (e) {
        console.log(`sticky fail: ${e.message?.slice(0, 100)}`)
      }
      await page.close()
    }
  }

  // SEO verification: pull head meta + Schema.org JSON-LD on first event.
  {
    const slug = slugs[0]
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      const seo = await page.evaluate(() => {
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
        `URL: ${BASE}/events/${slug}`,
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
    await page.close()
  }
}

await ctx.close()
await browser.close()
console.log('done')
