// Batch 9 - homepage screenshot capture.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-9-evidence'
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
    await new Promise(r => setTimeout(r, 400))
  })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(700)
}

// Full-page captures at 1440 + 375.
for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '375', w: 375, h: 812 }]) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: vp.w, height: vp.h })
  try {
    console.log(`capture homepage ${vp.name}`)
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    await page.screenshot({ path: `${OUT}/home-${vp.name}.png`, fullPage: true })
  } catch (e) {
    console.log(`  fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()
}

// Trust badges row close-up at 1440.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    const sec = page.locator('section', { hasText: 'No hidden fees' }).first()
    await sec.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await sec.screenshot({ path: `${OUT}/trust-badges-1440.png` })
    console.log('trust badges captured')
  } catch (e) {
    console.log(`trust fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()
}

// Surprise Me modal capture at 1440.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator('button', { hasText: 'Surprise me' }).first().click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/surprise-me-modal-1440.png`, fullPage: false })
    console.log('surprise me modal captured')
  } catch (e) {
    console.log(`surprise fail: ${e.message?.slice(0, 120)}`)
  }
  await page.close()
}

// Mobile bottom nav capture (375 with mid-scroll to show active state).
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 375, height: 812 })
  try {
    await page.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, 50))
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${OUT}/mobile-bottom-nav-browse-active-375.png`, fullPage: false })
    console.log('mobile bottom nav captured (Browse active)')
  } catch (e) {
    console.log(`bottom nav fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()
}

// SEO verification on homepage.
{
  const page = await ctx.newPage()
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
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
    writeFileSync(`${OUT}/seo-verification.txt`, [
      `URL: ${BASE}/`,
      `Title: ${seo.title}`,
      `Canonical: ${seo.canonical}`,
      '',
      '== meta tags ==',
      ...seo.meta.map(m => `  ${m.name ?? m.property}: ${m.content}`),
      '',
      '== Schema.org JSON-LD payloads ==',
      ...seo.jsonLd.map((j, i) => `--- payload ${i + 1} ---\n${j}\n`),
    ].join('\n'), 'utf-8')
    console.log('SEO verification captured')
  } catch (e) {
    console.log(`seo fail: ${e.message?.slice(0, 100)}`)
  }
  await page.close()
}

await ctx.close()
await browser.close()
console.log('done')
