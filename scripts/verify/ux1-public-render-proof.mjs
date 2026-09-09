/**
 * UX1 RENDER PROOF: the public event page, as a stranger loads it, at 390, 768
 * and 1440, against REAL rows on TEST.
 *
 * This is the half of the UX1 proof that needs no account. It drives the
 * surfaces the owner was looking at when they found the defects, on a real
 * published event with a real venue and a real organiser-uploaded cover, and
 * asserts the three things that were wrong on that page:
 *
 *   UX1.1  no markdown syntax is visible anywhere a reader can see it
 *   UX1.2  the venue name appears ONCE in "Getting there", not twice
 *   UX1.4  an organiser-supplied cover anchors to the top of the hero crop
 *
 * UX1.3 (two tags differing only by case) is proved by the database refusing
 * the shape, which is stronger than a page assertion and is recorded beside
 * this run. The signed-in half - an organiser writing a markdown bio and typing
 * colliding tags through the real forms - runs against the deployed preview,
 * because `auth-signup` and `auth-login` are failClosed on the rate limiter by
 * doctrine and a local checkout has no Upstash.
 *
 * The slug is ENUMERATED from the database, never guessed.
 *
 * Usage:
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/ux1-public-render-proof.mjs --slug <slug> --out C:/dev/EVIDENCE/UX1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX1'
let slug = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--slug') slug = args[++i]
}
const BASE = process.env.BASE ?? 'http://localhost:3311'
if (!slug) {
  console.error('FAIL: --slug is required and must be enumerated from the database, never guessed')
  process.exit(1)
}
if (/gndnldyfudbytbboxesk/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('refusing to run against production')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(22)} ${detail}`)
}

const browser = await chromium.launch()

for (const vp of VIEWPORTS) {
  console.log(`\n--- ${vp.label} ---`)
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'en-AU',
  })
  const page = await ctx.newPage()

  const res = await page.goto(`${BASE}/events/${slug}`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  })
  check(`${vp.label}-status`, res?.status() === 200, `GET /events/${slug} -> ${res?.status()}`)
  await page.waitForTimeout(900)

  const text = await page.locator('body').innerText()

  // The organiser's stored bio, read from the profile page this event links to,
  // so the UX1.1 assertion below knows whether it has anything to prove.
  const orgHref = await page
    .locator('a[href^="/organisers/"]')
    .first()
    .getAttribute('href')
    .catch(() => null)
  let bioSource = ''
  if (orgHref) {
    const probe = await ctx.newPage()
    await probe.goto(`${BASE}${orgHref}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    bioSource = await probe.locator('body').innerText().catch(() => '')
    await probe.close()
  }

  // UX1.1 - the syntax is never displayed.
  //
  // A check that cannot fail proves nothing. This assertion is only meaningful
  // if the SUBJECT actually carries markdown, so the subject is inspected
  // first: an organiser with a plain bio would pass this trivially and the
  // evidence file would claim a proof it never made. Where there is nothing to
  // render, the row is recorded as NOT EXERCISED rather than PASS, and UX1.1
  // rests on its unit tests, its drilled guard, and the signed-in journey.
  const rawBold = text.match(/\*\*[^*\n]{1,60}\*\*/g) ?? []
  const subjectHasMarkdown = /\*\*|\[[^\]]+\]\(/.test(bioSource)
  if (subjectHasMarkdown) {
    check(`${vp.label}-UX1.1`, rawBold.length === 0, rawBold.length ? `VISIBLE: ${rawBold.join(' ')}` : 'markdown rendered, syntax not shown')
  } else {
    checks.push({ id: `${vp.label}-UX1.1`, ok: null, detail: 'NOT EXERCISED: this organiser bio carries no markdown' })
    console.log(`  n/a   ${`${vp.label}-UX1.1`.padEnd(22)} NOT EXERCISED: this organiser bio carries no markdown`)
  }

  // UX1.2 - the venue name appears once. Read the "Getting there" row itself.
  const gettingThere = await page
    .getByText(/Getting there/i)
    .first()
    .locator('xpath=ancestor-or-self::*[self::li or self::div][1]')
    .innerText()
    .catch(() => '')
  const line = gettingThere.replace(/\s+/g, ' ').trim()
  // "Name, Name," is the exact production shape.
  const doubled = /([A-Za-z][\w'’ ]{2,40}), \1,/.test(line)
  check(
    `${vp.label}-UX1.2`,
    line.length > 0 && !doubled,
    doubled ? `DOUBLED: ${line.slice(0, 130)}` : line.slice(0, 130) || 'no Getting there row found',
  )

  // The Maps link must carry the SAME string the reader sees, so the words and
  // the pin cannot disagree.
  const mapsHref = await page
    .locator('a[href*="google.com/maps/search"]')
    .first()
    .getAttribute('href')
    .catch(() => null)
  if (mapsHref) {
    const q = decodeURIComponent(new URL(mapsHref).searchParams.get('query') ?? '')
    const qDoubled = /([A-Za-z][\w'’ ]{2,40}), \1,/.test(q)
    check(`${vp.label}-UX1.2-maps`, !qDoubled, qDoubled ? `DOUBLED IN MAPS: ${q}` : q.slice(0, 110))
  }

  // UX1.3 - no two rendered tags differ only by case.
  const tags = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/events?q="]')]
      .map(a => (a.textContent ?? '').trim().replace(/^#/, ''))
      .filter(Boolean),
  )
  const lowered = tags.map(t => t.toLowerCase())
  check(
    `${vp.label}-UX1.3`,
    new Set(lowered).size === lowered.length,
    tags.length ? `tags: ${tags.join(', ')}` : 'this event carries no tags',
  )

  // UX1.4 - the hero crop. The organiser's own cover anchors to the top.
  const hero = await page.evaluate(() => {
    const img = document.querySelector('main img, section img')
    if (!img) return null
    const cs = getComputedStyle(img)
    return { objectPosition: cs.objectPosition, objectFit: cs.objectFit, src: img.getAttribute('src') }
  })
  const isOrganiserCover = Boolean(hero?.src && !/^\/images\/hero\//.test(hero.src))
  check(
    `${vp.label}-UX1.4`,
    !isOrganiserCover || /(^|\s)0(%|px)|top/.test(hero?.objectPosition ?? ''),
    hero ? `${isOrganiserCover ? 'organiser cover' : 'curated raster'} object-position: ${hero.objectPosition}` : 'no hero image',
  )

  await page.screenshot({ path: join(out, `render-event-${vp.label}.png`) })
  await ctx.close()
}

await browser.close()

writeFileSync(
  join(out, 'ux1-render-proof.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, slug, checks, failures }, null, 2),
)

console.log('')
const exercised = checks.filter(c => c.ok !== null)
const skipped = checks.length - exercised.length
console.log(
  `UX1 render proof: ${exercised.length - failures.length} of ${exercised.length} exercised checks passed` +
    (skipped ? `, ${skipped} NOT EXERCISED (no subject to prove against)` : ''),
)
if (failures.length > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`evidence: ${out}`)
process.exit(0)
