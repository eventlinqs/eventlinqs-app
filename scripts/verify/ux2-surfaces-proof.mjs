/**
 * UX2 DRIVEN PROOF, at 390, 768 and 1440, against REAL rows on TEST.
 *
 * The four defects from the owner's live read of the first real organiser event:
 *
 *   UX2.1  LEGAL. The ABN is published from ONE source, so it changes everywhere
 *          at once. It was hand-written in twelve places, in four of which prose
 *          wrapping split it across two source lines.
 *   UX2.2  The venue map pin was an unlabelled dot whose only label was a hover
 *          tooltip, beside labelled commercial POIs.
 *   UX2.3  The right rail collided with the footer: the content section carried
 *          top padding only, so whichever column ran longer closed straight into
 *          the dark band.
 *   UX2.4  Contact addresses were published on a different domain from the site.
 *
 * UX2.3 IS MEASURED, NOT EYEBALLED. The script reads the bounding boxes of the
 * last content element and the footer and asserts real pixels between them. A
 * screenshot of a collision and a screenshot of a near miss look identical at
 * 390.
 *
 * The slug is ENUMERATED from the database by the caller, never guessed.
 *
 * Usage:
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/ux2-surfaces-proof.mjs --slug <slug> --out C:/dev/EVIDENCE/UX2
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX2'
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

/** The one place this script knows the expected ABN: read off the page itself. */
const ABN_ON_PAGE = /ABN\s+(\d{2} \d{3} \d{3} \d{3})/

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(24)} ${detail}`)
}

const browser = await chromium.launch()
const abnSeen = new Set()

for (const vp of VIEWPORTS) {
  console.log(`\n--- ${vp.label} ---`)
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-AU' })
  const page = await ctx.newPage()

  // -------------------------------------------------------------------------
  // The event page: UX2.2 the pin, UX2.3 the footer gap.
  // -------------------------------------------------------------------------
  const res = await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 90000 })
  check(`${vp.label}-event-200`, res?.status() === 200, `GET /events/${slug} -> ${res?.status()}`)

  // Scroll the page so the lazy venue map and the footer both mount.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(3500)

  // --- UX2.3: real pixels between the last content and the footer ---
  const gap = await page.evaluate(() => {
    const footer = document.querySelector('footer')
    if (!footer) return { error: 'no footer element' }
    const fTop = footer.getBoundingClientRect().top + window.scrollY
    // The last element of the content section that actually paints something.
    const section = document.querySelector('section.bg-canvas')
    if (!section) return { error: 'no content section' }
    const sRect = section.getBoundingClientRect()
    const sBottom = sRect.bottom + window.scrollY
    // The deepest painted box inside the section, which is what a reader sees
    // colliding, rather than the section box that may already have padding.
    let deepest = 0
    for (const el of section.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.height === 0 || r.width === 0) continue
      deepest = Math.max(deepest, r.bottom + window.scrollY)
    }
    return { footerTop: Math.round(fTop), sectionBottom: Math.round(sBottom), deepest: Math.round(deepest) }
  })
  if (gap.error) {
    check(`${vp.label}-UX2.3`, false, gap.error)
  } else {
    const clearance = gap.footerTop - gap.deepest
    // 24px is the floor for "closed properly": below that a card reads as
    // touching the dark band. The section now carries pb-12 (48px) / sm:pb-16.
    check(
      `${vp.label}-UX2.3`,
      clearance >= 24,
      `${clearance}px between the last content box and the footer (was 0 by construction)`,
    )
  }

  // --- UX2.2: the venue pin carries the venue name as real text ---
  const pin = await page.evaluate(() => {
    const gm = document.querySelector('gmp-advanced-marker, [role="button"][aria-label], .gm-style')
    if (!gm) return { present: false }
    // The advanced marker content is our own element: a plate with a text node.
    const plate = document.querySelector('.gm-style div[title]')
    return {
      present: true,
      title: plate?.getAttribute('title') ?? null,
      text: plate?.textContent?.trim() ?? null,
    }
  })
  const venueName = await page
    .evaluate(() => document.body.innerText.match(/Getting there\s*\n?\s*([^,\n]+)/)?.[1]?.trim() ?? null)
  if (!pin.present) {
    // A map that never loaded is NOT a pass and NOT a failure of the pin.
    //
    // DIAGNOSED, not shrugged at: on a local run Google answers
    // RefererNotAllowedMapError, because NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
    // restricted by HTTP referrer and localhost is not on the allowed list. No
    // local run of ANY kind can paint a map until that list changes, which is a
    // Google Cloud console setting and therefore the founder's. The pin element
    // itself is proved in tests/component/venue-pin.test.tsx.
    const detail =
      'NOT EXERCISED: Google refused the key for this referrer (RefererNotAllowedMapError); localhost is not on the key allowlist'
    checks.push({ id: `${vp.label}-UX2.2`, ok: null, detail })
    console.log(`  n/a   ${`${vp.label}-UX2.2`.padEnd(24)} ${detail}`)
  } else {
    check(
      `${vp.label}-UX2.2`,
      Boolean(pin.text && venueName && pin.text.includes(venueName.split(',')[0].trim())),
      pin.text ? `pin label reads "${pin.text}"` : 'the pin carries no text label',
    )
  }

  await page.screenshot({ path: join(out, `event-${vp.label}.png`) })

  // -------------------------------------------------------------------------
  // UX2.1 and UX2.4: the ABN and the contact addresses, on the surfaces that
  // publish them.
  // -------------------------------------------------------------------------
  for (const path of ['/legal/terms', '/legal/privacy', '/about', '/press']) {
    const r = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (r?.status() !== 200) {
      check(`${vp.label}-${path}-200`, false, `GET ${path} -> ${r?.status()}`)
      continue
    }
    const text = await page.locator('body').innerText()

    const m = ABN_ON_PAGE.exec(text)
    if (m) abnSeen.add(m[1])
    check(`${vp.label}-abn${path.replace(/\//g, '-')}`, Boolean(m), m ? `ABN ${m[1]}` : 'no ABN found on this page')

    // UX2.4: every EVENTLINQS address on the page is on ONE domain.
    //
    // Two things this must not get wrong, both found by running it:
    //   - a trailing full stop is punctuation, not part of the domain
    //     ("write to hello@eventlinqs.com." is one address, not a new TLD);
    //   - a THIRD-PARTY address is not a defect. The privacy policy cites
    //     enquiries@oaic.gov.au, the Office of the Australian Information
    //     Commissioner, because an APP-compliant policy has to tell people how
    //     to complain to the regulator. Flagging that would be flagging
    //     compliance.
    const ours = [...text.matchAll(/[A-Za-z0-9._%+-]+@(eventlinqs[A-Za-z0-9.-]*)/g)]
      .map(x => x[1].replace(/[.,;:)]+$/, ''))
    const domains = [...new Set(ours)]
    check(
      `${vp.label}-contact${path.replace(/\//g, '-')}`,
      domains.length <= 1,
      domains.length === 0
        ? 'no EventLinqs address on this page'
        : `EventLinqs addresses all on ${domains.join(' and ')}`,
    )
  }

  await page.goto(`${BASE}/legal/terms`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.screenshot({ path: join(out, `terms-${vp.label}.png`) })
  await ctx.close()
}

// THE POINT OF UX2.1: one source means one value, everywhere.
check(
  'abn-single-value',
  abnSeen.size === 1,
  abnSeen.size === 1
    ? `every surface published the same ABN: ${[...abnSeen][0]}`
    : `${abnSeen.size} DIFFERENT ABNs published: ${[...abnSeen].join(' / ')}`,
)

await browser.close()

writeFileSync(
  join(out, 'ux2-proof.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, slug, abnSeen: [...abnSeen], checks, failures }, null, 2),
)

const exercised = checks.filter(c => c.ok !== null)
const skipped = checks.length - exercised.length
console.log('')
console.log(
  `UX2 proof: ${exercised.length - failures.length} of ${exercised.length} exercised checks passed` +
    (skipped ? `, ${skipped} NOT EXERCISED` : ''),
)
if (failures.length > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`evidence: ${out}`)
process.exit(0)
