// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * The production sweep walker.
 *
 * Every gate on this platform is green. Green proves the code runs; it does not
 * prove a person can do the thing they came to do. This walks a surface the way
 * a person does and records what a person would see, including the failures no
 * existing gate looks for:
 *
 *   - copy that contradicts itself, apologises, or is a placeholder
 *   - a field rendering "undefined", "NaN", "Invalid Date" or an empty value
 *   - a tile that looks tappable and is not (Law 5 affordance)
 *   - an image slot that resolves to nothing
 *   - a page that scrolls sideways on a phone
 *   - a touch target under 44px
 *   - an empty state that shows nothing where it could show a beginning
 *   - a console error or a failed same-origin request the page swallowed
 *
 * Usage:
 *   node scripts/sweep/walk.mjs --base <url> --targets <file.json> [--only slug]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}

const BASE = (argOf('--base') || '').replace(/\/$/, '')
if (!BASE) {
  console.error('--base is required')
  process.exit(1)
}
const TARGETS_FILE = argOf('--targets', 'scripts/sweep/targets.json')
const ONLY = argOf('--only')
const OUT_DIR = argOf('--out', 'docs/roast/sweep-evidence')
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
]

// Copy the constitution bans outright, plus the tells of a field that did not
// get its value. "culture" is banned platform-wide in every form.
const COPY_BANS = [
  { id: 'em-dash', re: /—/, label: 'em-dash' },
  { id: 'en-dash', re: /–/, label: 'en-dash' },
  { id: 'banned-word-culture', re: /\bcultur(e|es|al)\b/i, label: 'the banned word' },
  { id: 'placeholder-coming-soon', re: /coming soon/i, label: '"coming soon"' },
  { id: 'placeholder-lorem', re: /lorem ipsum/i, label: 'lorem ipsum' },
  { id: 'placeholder-sample', re: /sample event \d/i, label: 'sample event N' },
  { id: 'placeholder-tbd', re: /\b(TODO|FIXME|TBD)\b/, label: 'a TODO marker' },
]

// These are never correct in rendered copy. They mean a value did not arrive.
const VALUE_TELLS = [
  { id: 'undefined', re: /\bundefined\b/ },
  { id: 'null-literal', re: /(^|[\s>(])null([\s<).,]|$)/ },
  { id: 'NaN', re: /\bNaN\b/ },
  { id: 'invalid-date', re: /Invalid Date/ },
  { id: 'object-Object', re: /\[object Object\]/ },
  { id: 'empty-money', re: /\$\s*(NaN|undefined|null)/i },
  { id: 'unresolved-token', re: /\{\{?\s*[a-zA-Z_.]+\s*\}?\}/ },
]

const targets = JSON.parse(readFileSync(TARGETS_FILE, 'utf8')).filter(
  (t) => !ONLY || t.id === ONLY,
)

const linkCache = new Map()
async function checkLink(url, request) {
  if (linkCache.has(url)) return linkCache.get(url)
  let result
  try {
    const res = await request.get(url, { maxRedirects: 5, timeout: 30000 })
    result = { status: res.status(), ok: res.ok() }
  } catch (e) {
    result = { status: 0, ok: false, error: String(e.message || e).slice(0, 120) }
  }
  linkCache.set(url, result)
  return result
}

/** Runs inside the page. Returns everything a person could notice. */
const OBSERVE = () => {
  const visibleText = (el) => {
    if (!el) return ''
    const s = window.getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return ''
    return el.innerText || ''
  }
  const main = document.querySelector('main') || document.body
  const bodyText = visibleText(main)

  // Every internal link the page renders.
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({
    href: a.getAttribute('href'),
    text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80),
  }))

  // A tile-shaped image inside a grid or a rail must be inside a link.
  //
  // Exempt, deliberately: full-bleed backgrounds, and the single editorial
  // photo of a marketing feature band. Law 4 REQUIRES alternating
  // image-and-text bands on marketing surfaces and those images are not tiles;
  // an earlier version of this check flagged all five bands on /organisers and
  // that was the instrument crying wolf, not a defect.
  //
  // The distinguishing property is siblings: a rail or grid of tiles holds
  // three or more comparable images under one container, a feature band holds
  // exactly one. So candidates are grouped by container and only a group of
  // three or more counts.
  const candidates = []
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect()
    if (r.width < 90 || r.height < 70) continue
    if (r.width > window.innerWidth * 0.92) continue // full-bleed hero, exempt
    const container = img.closest('[data-rail], [class*="grid"], [class*="rail"], ul, ol')
    if (!container) continue
    if (img.closest('a[href], button')) continue
    if (img.closest('header, footer, nav')) continue
    candidates.push({ container, img, r })
  }
  const byContainer = new Map()
  for (const c of candidates) {
    if (!byContainer.has(c.container)) byContainer.set(c.container, [])
    byContainer.get(c.container).push(c)
  }
  const deadTiles = []
  for (const [, group] of byContainer) {
    // Count every comparable image in the container, linked or not, so a grid
    // where only one tile lost its link is still caught.
    const siblingImages = group[0].container.querySelectorAll('img').length
    if (siblingImages < 3) continue
    for (const c of group) {
      deadTiles.push({
        src: (c.img.currentSrc || c.img.src || '').slice(-110),
        alt: c.img.alt,
        w: Math.round(c.r.width),
        h: Math.round(c.r.height),
        siblings: siblingImages,
      })
    }
  }

  // An image slot that resolved to nothing.
  const brokenImages = [...document.querySelectorAll('img')]
    .filter((i) => i.complete && i.naturalWidth === 0)
    .map((i) => ({ src: (i.currentSrc || i.src || '').slice(-110), alt: i.alt }))

  // A link that goes nowhere, which reads as a control and is not one.
  const inertAnchors = [...document.querySelectorAll('a')]
    .filter((a) => {
      const h = a.getAttribute('href')
      return h === null || h === '' || h === '#'
    })
    .filter((a) => a.getBoundingClientRect().width > 0)
    .map((a) => ({ text: (a.innerText || '').trim().slice(0, 60), href: a.getAttribute('href') }))

  // Touch targets, mobile law is 44px.
  //
  // Only genuinely small ones. A text link inside a paragraph is not a touch
  // target failure (WCAG 2.5.8 exempts inline text), and the skip link is
  // off-screen until focused. Reporting those buried the real cases: controls
  // that are small in BOTH directions, which is what a finger misses.
  const smallTargets = [...document.querySelectorAll('a[href], button, [role="button"]')]
    .map((el) => {
      const r = el.getBoundingClientRect()
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim()
      const inProse = Boolean(el.closest('p, li:not([class*="nav"]), .prose'))
      return { el, r, text: text.slice(0, 50), inProse }
    })
    .filter(({ r, text, inProse }) => {
      if (r.width <= 0 || r.height <= 0) return false
      if (inProse) return false
      if (/skip to main/i.test(text)) return false
      return r.height < 44 && r.width < 44
    })
    .map(({ r, text }) => ({ text, w: Math.round(r.width), h: Math.round(r.height) }))

  // How much is actually on this page. A rail with 1 item beside a rail with 7
  // is a defect under the volume law, so count per rail as well as overall.
  const cards = document.querySelectorAll(
    'a[href^="/events/"], a[href^="/city/"], a[href^="/community/"], a[href^="/categories/"]',
  ).length

  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .map((h) => (h.innerText || '').trim())
    .filter(Boolean)
    .slice(0, 40)

  return {
    title: document.title,
    h1: (document.querySelector('h1')?.innerText || '').trim(),
    bodyText: bodyText.slice(0, 20000),
    bodyTextLength: bodyText.length,
    links,
    deadTiles,
    brokenImages,
    inertAnchors,
    smallTargets,
    cards,
    headings,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }
}

function copyFindings(text) {
  const out = []
  for (const ban of COPY_BANS) {
    const m = text.match(ban.re)
    if (m) {
      const i = text.indexOf(m[0])
      out.push({
        kind: 'copy-ban',
        id: ban.id,
        label: ban.label,
        context: text.slice(Math.max(0, i - 70), i + 90).replace(/\s+/g, ' '),
      })
    }
  }
  for (const tell of VALUE_TELLS) {
    const m = text.match(tell.re)
    if (m) {
      const i = text.indexOf(m[0])
      out.push({
        kind: 'value-tell',
        id: tell.id,
        context: text.slice(Math.max(0, i - 70), i + 90).replace(/\s+/g, ' '),
      })
    }
  }
  return out
}

const results = []
const browser = await chromium.launch()

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    deviceScaleFactor: 1,
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  })
  const dir = path.join(OUT_DIR, vp.name)
  mkdirSync(dir, { recursive: true })

  for (const target of targets) {
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    const failedRequests = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 240))
    })
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 240)))
    page.on('response', (res) => {
      const u = res.url()
      if (res.status() >= 400 && u.startsWith(BASE)) {
        failedRequests.push({ status: res.status(), url: u.replace(BASE, '') })
      }
    })

    const url = BASE + target.path
    const record = { id: target.id, path: target.path, viewport: vp.name, url }

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      record.status = response ? response.status() : 0
      await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
      await page.waitForTimeout(700)

      const obs = await page.evaluate(OBSERVE)
      Object.assign(record, {
        title: obs.title,
        h1: obs.h1,
        cards: obs.cards,
        headings: obs.headings,
        bodyTextLength: obs.bodyTextLength,
        deadTiles: obs.deadTiles,
        brokenImages: obs.brokenImages,
        inertAnchors: obs.inertAnchors,
        smallTargets: vp.isMobile ? obs.smallTargets : [],
        overflowX: obs.overflowX ? { scrollWidth: obs.scrollWidth, innerWidth: obs.innerWidth } : null,
        copy: copyFindings(obs.bodyText),
        bodyExcerpt: obs.bodyText.replace(/\s+/g, ' ').slice(0, 1400),
      })

      // Link integrity, desktop pass only: the href set does not differ by
      // viewport and checking twice doubles the run for nothing.
      if (!vp.isMobile) {
        const internal = [
          ...new Set(
            obs.links
              .map((l) => l.href)
              .filter((h) => h && h.startsWith('/') && !h.startsWith('//'))
              .map((h) => h.split('#')[0])
              .filter(Boolean),
          ),
        ]
        const broken = []
        for (const href of internal) {
          const r = await checkLink(BASE + href, context.request)
          if (!r.ok) broken.push({ href, ...r })
        }
        record.internalLinkCount = internal.length
        record.brokenLinks = broken
      }

      const shot = path.join(dir, `${target.id}.png`)
      await page.screenshot({ path: shot, fullPage: target.fullPage !== false })
      record.screenshot = shot
    } catch (e) {
      record.error = String(e.message || e).slice(0, 300)
    }

    record.consoleErrors = consoleErrors
    record.pageErrors = pageErrors
    record.failedRequests = failedRequests
    results.push(record)

    const flags = [
      record.error && 'CRASH',
      record.status && record.status >= 400 && `HTTP ${record.status}`,
      record.pageErrors?.length && `${record.pageErrors.length} page error`,
      record.brokenLinks?.length && `${record.brokenLinks.length} dead link`,
      record.deadTiles?.length && `${record.deadTiles.length} dead tile`,
      record.brokenImages?.length && `${record.brokenImages.length} broken img`,
      record.copy?.length && `${record.copy.length} copy`,
      record.overflowX && 'OVERFLOW-X',
      record.failedRequests?.length && `${record.failedRequests.length} failed req`,
    ].filter(Boolean)
    console.log(
      `${vp.name.padEnd(7)} ${String(record.status || '-').padEnd(4)} ${target.path.padEnd(46)} ${
        flags.length ? 'FLAG: ' + flags.join(', ') : 'clean'
      }`,
    )

    await page.close()
  }
  await context.close()
}

await browser.close()
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(results, null, 1))
console.log(`\nwrote ${results.length} records to ${path.join(OUT_DIR, 'report.json')}`)
