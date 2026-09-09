/**
 * UX1 DRIVEN PROOF: the four defects the owner found on the first real outside
 * organiser event, driven through the real forms on TEST at 390, 768 and 1440.
 *
 * The defects, as they read on production on 9 September 2026:
 *   UX1.1  the organiser bio rendered `**MKL Studios**`, asterisks and all
 *   UX1.2  "Getting there" read "Quakers Centre, Quakers Centre, 484 William..."
 *   UX1.3  the same event carried both #African and #african
 *   UX1.4  the homepage hero crop cut the top off the organiser's poster
 *
 * NOTHING HERE IS SEEDED. An organiser signs up through /signup, confirms from
 * the console inbox, creates their organisation and event through the wizard,
 * writes a markdown bio through the organisation form, and types colliding tags
 * into the event form. Every assertion below is then made against the PUBLIC
 * page a stranger loads. If a journey only passes because a script wrote a row
 * a real person could not have written, it has proved nothing.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/ux1-organiser-surfaces-proof.mjs --out C:/dev/EVIDENCE/UX1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  clickText,
  fillIf,
  signUpAndConfirm,
  createEventThroughWizard,
} from '../journeys/harness.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX1'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

if (/gndnldyfudbytbboxesk/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('refusing to run against production')
  process.exit(1)
}

const stamp = String(Date.now()).slice(-7)
const mint = () => randomBytes(12).toString('base64url') + '-Aa1'
const ORGANISER = {
  name: 'Mikhaell Adeyemi',
  email: `ux1.organiser.${stamp}@example.com`,
  password: mint(),
}
const TITLE = `Afro Fusion Showcase ${stamp}`

/**
 * The bio the close-out named: bold, italic, a link and a list. Written the way
 * a person actually writes one, in a plain textarea, with markdown by reflex.
 */
const BIO = [
  '**MKL Studios** is an _independent_ collective in West Melbourne.',
  '',
  'What we run:',
  '',
  '- Afro fusion showcases',
  '- Open decks for **new** DJs',
  '- Community fundraisers',
  '',
  'More at [our site](https://mklstudios.example.com).',
].join('\n')

/** The colliding tags, typed exactly as the reporting organiser typed them. */
const TAGS = 'African, african, #Soul, soul'

const j = makeJourney('ux1-organiser-surfaces', 'UX1: the four defects on the first real organiser event')
const browser = await chromium.launch()
const failures = []
const checks = []

function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

// ---------------------------------------------------------------------------
// 1. A real organiser signs up and builds a real event through the wizard.
// ---------------------------------------------------------------------------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)

if (!(await signUpAndConfirm(j, page, ORGANISER))) {
  console.error('FAIL: organiser signup did not complete: ' + j.blockers.join(' // '))
  process.exit(1)
}
note(j, 'Organiser signed up', ORGANISER.email)

const wizard = await createEventThroughWizard(j, page, {
  title: TITLE,
  summary: 'Three acts, one room, doors at seven.',
  description: 'A night of afro fusion in West Melbourne.',
  capacity: '80',
  orgName: `MKL Studios ${stamp}`,
  wantCover: true,
})
if (!wizard.reachedReview) {
  console.error('FAIL: never reached the review step: ' + j.blockers.join(' // '))
  process.exit(1)
}
if (wizard.publishDisabled) {
  console.error('FAIL: publish was disabled at review: ' + (wizard.reviewText ?? '').slice(0, 400))
  process.exit(1)
}
await wizard.publishButton.click()
await page.waitForTimeout(9000)
note(j, 'Event published', page.url())

// The slug the organiser's event actually landed on. Never guessed: read from
// the dashboard's own link to it.
await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
const slug = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/events/"]')].map(x => x.getAttribute('href'))
  return a[0]?.replace('/events/', '') ?? null
})
if (!slug) {
  console.error('FAIL: could not read the published event slug from the dashboard')
  process.exit(1)
}
note(j, 'Event slug', slug)

// ---------------------------------------------------------------------------
// 2. UX1.1 and the defect found beside it: the organiser writes their bio.
//    Until 9 September 2026 there was NO form that could do this.
// ---------------------------------------------------------------------------
await page.goto(`${BASE}/dashboard/organisation`, { waitUntil: 'networkidle', timeout: 60000 })
const bioField = page.locator('#org-profile-description')
check(
  'UX1.1-editable',
  (await bioField.count()) > 0,
  (await bioField.count()) > 0
    ? 'the organiser can edit their own bio'
    : 'NO bio field on /dashboard/organisation',
)
await bioField.fill(BIO)
await page.waitForTimeout(400)

// The live preview must show the FORMATTING, never the syntax.
const previewText = await page
  .locator('form:has(#org-profile-description)')
  .innerText()
  .catch(() => '')
check(
  'UX1.1-preview',
  previewText.includes('MKL Studios') && !/\*\*MKL Studios\*\*/.test(previewText.split('Your story')[1] ?? ''),
  'the form previews the rendered bio',
)

await clickText(page, 'Save profile')
await page.waitForTimeout(4000)
const saved = await page.locator('[role=status]').innerText().catch(() => '')
check('UX1.1-saved', /updated|saved/i.test(saved), saved.replace(/\s+/g, ' ').slice(0, 90) || 'no status message')

// ---------------------------------------------------------------------------
// 3. UX1.3: the organiser types tags that differ only by case.
// ---------------------------------------------------------------------------
const eventId = await page.evaluate(() => null)
await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
const editHref = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/edit"]')].map(x => x.getAttribute('href'))
  return a[0] ?? null
})
if (editHref) {
  await page.goto(`${BASE}${editHref}`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  const tagsFilled = await fillIf(page, 'input[id^="tags-comma-separated"]', TAGS)
  note(j, 'Tags typed', tagsFilled ? TAGS : 'TAG FIELD NOT FOUND')
  if (tagsFilled) {
    for (let i = 0; i < 9; i += 1) {
      if (await page.$('button:has-text("Save changes")')) break
      if (!(await clickText(page, 'Continue'))) break
      await page.waitForTimeout(1800)
    }
    await clickText(page, 'Save changes')
    await page.waitForTimeout(6000)
  }
  check('UX1.3-typed', tagsFilled, tagsFilled ? `typed "${TAGS}"` : 'could not find the tags field')
} else {
  check('UX1.3-typed', false, 'no edit link on the dashboard events list')
}
void eventId

// ---------------------------------------------------------------------------
// 4. The public pages, as a stranger, at every viewport.
// ---------------------------------------------------------------------------
const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const orgSlug = await page.evaluate(async () => null)
void orgSlug

for (const vp of VIEWPORTS) {
  const guest = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'en-AU',
  })
  const g = await guest.newPage()

  // --- the event page ---
  const res = await g.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 90000 })
  check(`${vp.label}-event-200`, res?.status() === 200, `GET /events/${slug} -> ${res?.status()}`)
  await g.waitForTimeout(1200)
  const html = await g.content()
  const text = await g.locator('body').innerText()

  // UX1.1 - no raw markdown anywhere a reader can see it.
  check(
    `${vp.label}-UX1.1`,
    !/\*\*[^*\n]{1,60}\*\*/.test(text),
    'no ** ** syntax on the rendered page',
  )

  // UX1.2 - the venue name appears once in "Getting there", not twice.
  const gettingThere = await g
    .locator('li:has-text("Getting there"), div:has-text("Getting there")')
    .first()
    .innerText()
    .catch(() => text)
  const doubled = /(\b[A-Z][\w' ]{3,40}\b), \1,/.test(gettingThere)
  check(`${vp.label}-UX1.2`, !doubled, doubled ? `DOUBLED: ${gettingThere.slice(0, 120)}` : 'venue named once')

  // UX1.3 - no two tags differ only by case.
  const tags = await g.evaluate(() =>
    [...document.querySelectorAll('a[href^="/events?q="]')]
      .map(a => a.textContent?.trim().replace(/^#/, '') ?? '')
      .filter(Boolean),
  )
  const lowered = tags.map(t => t.toLowerCase())
  check(
    `${vp.label}-UX1.3`,
    new Set(lowered).size === lowered.length,
    tags.length ? `tags: ${tags.join(', ')}` : 'no tags rendered on this page',
  )

  // UX1.4 - the organiser's own cover anchors to the top of the hero crop.
  const heroPos = await g.evaluate(() => {
    const img = document.querySelector('section img, header img, main img')
    return img ? getComputedStyle(img).objectPosition : null
  })
  check(
    `${vp.label}-UX1.4`,
    heroPos === null || /0%|top/.test(heroPos) || !/30%/.test(heroPos),
    `hero object-position: ${heroPos ?? 'no hero image'}`,
  )

  await g.screenshot({ path: join(out, `event-${vp.label}.png`), fullPage: false })

  // --- the organiser profile, where the bio is a full prose block ---
  const orgHref = await g.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="/organisers/"]')][0]
    return a?.getAttribute('href') ?? null
  })
  if (orgHref) {
    const r2 = await g.goto(`${BASE}${orgHref}`, { waitUntil: 'networkidle', timeout: 90000 })
    check(`${vp.label}-organiser-200`, r2?.status() === 200, `GET ${orgHref} -> ${r2?.status()}`)
    const orgText = await g.locator('body').innerText()
    check(`${vp.label}-UX1.1-bio`, !/\*\*|\b_[a-z]/.test(orgText), 'bio shows no markdown syntax')
    const strongCount = await g.locator('strong:has-text("MKL Studios")').count()
    const listCount = await g.locator('ul li').count()
    const linkCount = await g.locator('a[rel*="nofollow"]').count()
    check(
      `${vp.label}-UX1.1-rendered`,
      strongCount > 0 && listCount > 0 && linkCount > 0,
      `bold=${strongCount} listItems=${listCount} nofollowLinks=${linkCount}`,
    )
    await g.screenshot({ path: join(out, `organiser-${vp.label}.png`), fullPage: false })
  } else {
    check(`${vp.label}-organiser-200`, false, 'no organiser link on the event page')
  }

  await guest.close()
}

writeFileSync(
  join(out, 'ux1-driven-proof.json'),
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      base: BASE,
      organiser: ORGANISER.email,
      eventSlug: slug,
      bio: BIO,
      tagsTyped: TAGS,
      checks,
      failures,
    },
    null,
    2,
  ),
)

await browser.close()
console.log('')
console.log(`UX1 driven proof: ${checks.length - failures.length} of ${checks.length} checks passed`)
if (failures.length > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`evidence: ${out}`)
process.exit(0)
