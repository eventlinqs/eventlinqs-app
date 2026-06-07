// Verify the platform-wide hover breathing wash (.card-hover-wash) on the
// deployed preview. Because the wash is armed only under html[data-motion="1"]
// (set pre-paint for real visitors, NOT for headless/audit UAs or
// prefers-reduced-motion), a default headless screenshot can never show it -
// that is the "audits never pay for it" guarantee. So we drive the three
// gating paths explicitly and assert computed opacity:
//
//   A. real UA + normal motion   -> data-motion=1, wash 0 at rest, ~1 on hover
//   B. real UA + reduced motion  -> no data-motion, wash stays 0 on hover
//   C. default headless/audit UA -> data-headless=1, wash stays 0 on hover
//
// Usage: node scripts/verify-hover-wash.mjs [BASE]
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE =
  process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/benchmark/system-pass/overnight-elevation/hover-wash'
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []

// Read the html motion flag + the at-rest and on-hover opacity of the first
// card-hover-wash on the page. Returns null if no wash element is present.
async function probe(page) {
  const flags = await page.evaluate(() => ({
    motion: document.documentElement.dataset.motion ?? null,
    headless: document.documentElement.dataset.headless ?? null,
  }))
  const targetCount = await page.locator('.card-hover-wash').count()
  if (targetCount === 0) return { flags, targetCount, rest: null, hover: null }

  // Hover the nearest .group ancestor of the first wash element.
  const wash = page.locator('.card-hover-wash').first()
  const rest = await wash.evaluate((el) => Number(getComputedStyle(el).opacity))
  const group = page.locator('.group:has(> * .card-hover-wash), .group:has(.card-hover-wash)').first()
  await group.hover()
  await page.waitForTimeout(450)
  const hover = await wash.evaluate((el) => Number(getComputedStyle(el).opacity))
  return { flags, targetCount, rest, hover }
}

async function run(label, contextOpts, shot) {
  const ctx = await browser.newContext(contextOpts)
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(1000)
  const r = await probe(page)
  if (shot) {
    const group = page.locator('.group:has(.card-hover-wash)').first()
    try {
      await group.scrollIntoViewIfNeeded()
      await group.screenshot({ path: `${OUT}/${shot}-rest.png` })
      await group.hover()
      await page.waitForTimeout(450)
      await group.screenshot({ path: `${OUT}/${shot}-hover.png` })
    } catch {}
  }
  results.push({ label, ...r })
  await ctx.close()
}

// A. real UA + normal motion
await run('A real-UA normal-motion (wash SHOULD arm)', {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  userAgent: REAL_UA,
  reducedMotion: 'no-preference',
}, 'desktop')

// B. real UA + reduced motion
await run('B real-UA reduced-motion (wash must NOT arm)', {
  viewport: { width: 1440, height: 900 },
  userAgent: REAL_UA,
  reducedMotion: 'reduce',
})

// C. default headless/audit UA (no UA override -> HeadlessChrome)
await run('C headless/audit UA (wash must NOT arm)', {
  viewport: { width: 1440, height: 900 },
})

await browser.close()

// ── Verdict ───────────────────────────────────────────────────────────────
let pass = true
const fail = (m) => { pass = false; console.log('  FAIL: ' + m) }
for (const r of results) {
  console.log(
    `\n[${r.label}]\n  data-motion=${r.flags.motion} data-headless=${r.flags.headless} ` +
    `washes=${r.targetCount} rest=${r.rest} hover=${r.hover}`,
  )
}
const A = results[0], B = results[1], C = results[2]
if (A.targetCount === 0) fail('A: no .card-hover-wash present on homepage')
if (A.flags.motion !== '1') fail('A: expected data-motion=1 under real UA')
if (A.rest !== null && A.rest > 0.02) fail(`A: wash not transparent at rest (${A.rest})`)
if (A.hover !== null && A.hover < 0.6) fail(`A: wash did not fade in on hover (${A.hover})`)
if (B.hover !== null && B.hover > 0.02) fail(`B: wash armed under reduced-motion (${B.hover})`)
if (C.flags.headless !== '1') fail('C: expected data-headless=1 under headless UA')
if (C.hover !== null && C.hover > 0.02) fail(`C: wash armed under headless/audit (${C.hover})`)

console.log('\n' + (pass ? 'PASS: hover wash arms only for real motion-on visitors.' : 'VERDICT: FAIL'))
process.exit(pass ? 0 : 1)
