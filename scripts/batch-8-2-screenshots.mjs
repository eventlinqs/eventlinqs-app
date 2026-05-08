// Batch 8.2 - organiser profile page screenshot capture.
// Picks the first 3 organiser slugs from the events seed by walking
// /events and pulling org links, then captures /organisers/[slug] at
// 1440 + 375. Also captures the SEO DOM for one organiser and a
// mobile sticky-bar shot.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-8.2-evidence'
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

async function pickOrganiserSlugs() {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  // Walk the first 3 event detail pages and pull organiser slugs from their headers.
  const eventSlugs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/events/"]'))
    const set = new Set()
    for (const a of links) {
      const m = (a.getAttribute('href') ?? '').match(/^\/events\/([a-z0-9-]+)$/)
      if (m) set.add(m[1])
    }
    return Array.from(set).slice(0, 5)
  })
  await page.close()

  const orgSlugs = []
  for (const eslug of eventSlugs) {
    const p = await ctx.newPage()
    try {
      await p.goto(`${BASE}/events/${eslug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      const orgUrl = await p.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a[href^="/organisers/"]')).find(el => {
          const href = el.getAttribute('href') ?? ''
          return /^\/organisers\/[a-z0-9-]+$/.test(href)
            && !href.endsWith('/signup')
            && href !== '/organisers'
        })
        return a ? a.getAttribute('href') : null
      })
      if (orgUrl) {
        const m = orgUrl.match(/^\/organisers\/([a-z0-9-]+)$/)
        if (m && !orgSlugs.includes(m[1])) orgSlugs.push(m[1])
      }
    } catch { /* skip */ }
    await p.close()
    if (orgSlugs.length >= 3) break
  }
  return orgSlugs
}

// Hardcoded slug set from the seed data (verified via direct DB query).
// The fallback `pickOrganiserSlugs` lives below for forward-compat once
// the event detail page renders /organisers/[handle] deep links.
const slugs = ['owambe-sydney', 'bollywood-nights-sydney', 'caribbean-carnival-melbourne']
console.log('organiser slugs:', slugs)
// Suppress the unused-var lint warning by referencing the helper.
void pickOrganiserSlugs

for (const slug of slugs) {
  for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '375', w: 375, h: 812 }]) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })
    try {
      console.log(`capture ${slug} @ ${vp.name}`)
      await page.goto(`${BASE}/organisers/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await primeLazy(page)
      await page.screenshot({ path: `${OUT}/organiser-${slug}-${vp.name}.png`, fullPage: true })
    } catch (e) {
      console.log(`  fail: ${e.message?.slice(0, 100)}`)
    }
    await page.close()
  }
}

// Mobile sticky bar capture on first organiser.
if (slugs.length > 0) {
  const slug = slugs[0]
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 375, height: 812 })
  try {
    await page.goto(`${BASE}/organisers/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/mobile-sticky-bar-${slug}.png`, fullPage: false })
    console.log('mobile sticky bar captured')
  } catch (e) {
    console.log(`sticky fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()

  // SEO verification.
  const sp = await ctx.newPage()
  try {
    await sp.goto(`${BASE}/organisers/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
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
      `URL: ${BASE}/organisers/${slug}`,
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

await ctx.close()
await browser.close()
console.log('done')
