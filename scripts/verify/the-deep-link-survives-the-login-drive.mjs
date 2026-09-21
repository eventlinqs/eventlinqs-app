/**
 * DRIVEN PROOF: SIGNING IN TAKES YOU WHERE YOU WERE GOING, AND NEVER OFF-ORIGIN.
 *
 * ---------------------------------------------------------------------------
 * THE TWO DEFECTS THIS PROVES FIXED, both found on 21 September 2026 while
 * driving something else, and both invisible to every test in the tree.
 *
 * 1. THE DEEP LINK WAS WRITTEN BY ONE HALF OF THE PLATFORM AND READ BY NEITHER.
 *    Twelve pages bounced a signed-out visitor to `/login?redirect=<path>` and
 *    were read. NINE bounced them to `/login?next=<path>` and `login-form.tsx`
 *    read only `redirect`, so every one of those nine dropped the person on the
 *    dashboard instead of the page they had asked for. A tenth, `?returnUrl=` on
 *    the waitlist modal, was found by the guard rather than by the hand count.
 *
 *    The two that are not merely annoying: `/scan/[eventId]` is a door staffer
 *    at a venue on their phone, and `/squad/[token]/pay/[member_id]` is somebody
 *    paying their share of a group booking.
 *
 * 2. THE SIGN-IN PAGE WOULD REDIRECT OFF-ORIGIN. The form's inline safety check
 *    asked "does it start with `//`". A BACKSLASH does not, and
 *    `new URL('/\\evil.com', 'https://eventlinqs.com.au/login').href` is
 *    `https://evil.com/`. The stricter check was already in the tree, in the
 *    magic-link route; the two copies had drifted and the weaker one was on the
 *    page where somebody has just typed their password.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DRIVEN, AND WHY ONE CASE IS DRIVEN AT ONE WIDTH RATHER THAN THREE.
 *
 * The two DESTINATION cases run at every width, because where a person lands is
 * what the item is about and a landing is a rendered page.
 *
 * The REFUSAL case runs at 390 only, and that is a judgement rather than an
 * omission: it is a property of a pure function that
 * tests/unit/auth/safe-redirect.test.ts covers exhaustively, including the three
 * backslash spellings. What driving it adds is proof that the real browser, the
 * real router and the real form agree with that function once, which does not
 * become more true at 1440. Signing in is also rate limited at ten per ten
 * minutes per address, and spending three of those to photograph the same
 * refusal three times would be the drive competing with itself.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/the-deep-link-survives-the-login-drive.mjs --width 390 --tag lane-c-deep-1
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/DEEP-LINK'
let width = 1440
let tag = null
let cleanup = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--width') width = Number(args[++i])
  else if (args[i] === '--tag') tag = args[++i]
  else if (args[i] === '--cleanup') cleanup = true
}
mkdirSync(out, { recursive: true })
if (!tag) {
  console.error('FAIL: --tag is required, so the widths share the account they created')
  process.exit(1)
}

const BASE = process.env.BASE ?? 'http://localhost:3200'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const LEDGER = join(out, `${tag}-checks.json`)
const STATE = join(out, `${tag}-account.json`)
const checks = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []
const failures = []
function check(id, ok, detail) {
  checks.push({ width, id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
function finish() {
  writeFileSync(LEDGER, JSON.stringify(checks, null, 2))
  const mine = checks.filter((c) => c.width === width)
  console.log(`\n  width ${width}: ${mine.filter((c) => c.ok).length} of ${mine.length} checks pass`)
  if (failures.length > 0) {
    console.log('\n  FAILURES')
    for (const f of failures) console.log(`    ${f}`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

/** The account, created once and reused by every width. */
async function account() {
  if (existsSync(STATE)) return JSON.parse(readFileSync(STATE, 'utf8'))
  const email = `deep.${tag}.${Date.now().toString(36)}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`create account: ${created.error.message}`)
  const userId = created.data.user.id
  await db.from('profiles').upsert({
    id: userId,
    email,
    full_name: 'Lane C Deep Link',
    display_name: 'Lane C Deep Link',
    is_verified: true,
  })
  const record = { userId, email, password }
  writeFileSync(STATE, JSON.stringify(record, null, 2))
  return record
}

if (cleanup) {
  const who = JSON.parse(readFileSync(STATE, 'utf8'))
  await db.from('profiles').delete().eq('id', who.userId)
  await tearDownAccountOrFailTheRun(db, who.userId)
  const { data: left } = await db.from('profiles').select('id').eq('id', who.userId)
  check('cleanup.the-account-is-gone', (left ?? []).length === 0, `${(left ?? []).length} profile row(s) left`)
  finish()
}

/**
 * WAIT FOR REACT TO HAVE ATTACHED, RATHER THAN HOPING IT HAS.
 *
 * This is the whole difference between a drive that reports the product and one
 * that reports its own timing. Playwright's auto-waiting proves a button is
 * present, visible and enabled; none of that says the framework has claimed it.
 * A click on an un-hydrated button produces NO POST AT ALL, leaves the button
 * reading "Sign in", shows the person nothing, and looks exactly like a broken
 * sign-in. Measured here repeatedly, and it is intermittent, which is worse than
 * being consistently broken because it reads as flakiness in the product.
 *
 * React attaches `__reactFiber$...` and `__reactProps$...` properties to the DOM
 * nodes it takes over, so their presence on the submit button is a direct
 * observation that hydration has happened, rather than a sleep chosen by feel.
 */
async function waitForHydration(page, selector = 'button[type="submit"]') {
  await page.waitForSelector(selector, { state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    (sel) => {
      const node = document.querySelector(sel)
      return !!node && Object.keys(node).some((key) => key.startsWith('__react'))
    },
    selector,
    { timeout: 30_000 },
  )
}

/**
 * Sign in on whatever page is showing.
 *
 * A REFUSAL IS RAISED, NEVER RETRIED: the form renders its error in a
 * `role="alert"` box, and a drive that clicked through one would report a
 * success it did not have.
 */
async function signInHere(page, who) {
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)))

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // A dev server can also serve a page whose chunk never arrives, and that one
    // never hydrates however long anybody waits. A reload is the only answer to
    // it, and it costs one navigation on the attempts that did not need it.
    if (attempt > 1) await page.reload({ waitUntil: 'domcontentloaded' })

    await waitForHydration(page)
    await page.fill('input[type="email"]', who.email)
    await page.fill('input[type="password"]', who.password)
    await page.click('button[type="submit"]')

    try {
      await page.waitForURL((url) => url.pathname !== '/login', { timeout: 25_000 })
      return
    } catch {
      const refusal = (
        await page.locator('[role="alert"]').allTextContents().catch(() => [])
      ).filter(Boolean)
      if (refusal.length > 0) throw new Error(`sign-in refused: ${refusal.join(' ')}`)
    }
  }
  throw new Error(
    `sign-in never completed after three hydrated attempts and the form never said anything. ` +
      `Page errors seen: ${JSON.stringify(pageErrors.slice(0, 4))}`,
  )
}

const who = await account()
const browser = await chromium.launch()

/* ------------------------------------------------------------------------- */
/* The two destination cases: bounce, sign in, and land where you were going. */
/* ------------------------------------------------------------------------- */

const DESTINATIONS = [
  {
    id: 'next',
    path: '/account/saved',
    note: 'emits ?next=, the spelling nothing read until today',
  },
  {
    id: 'redirect',
    path: '/tickets',
    note: 'emits ?redirect=, the spelling that always worked; the control',
  },
]

for (const dest of DESTINATIONS) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1440 ? 900 : 844 } })
  const page = await context.newPage()

  // Signed out, ask for the page. The platform must bounce us to the form and
  // carry the destination with it.
  await page.goto(`${BASE}${dest.path}`, { waitUntil: 'domcontentloaded' })
  const bounced = new URL(page.url())
  const carried = bounced.searchParams.get('redirect') ?? bounced.searchParams.get('next')
  check(
    `${width}.${dest.id}.the-bounce-carries-the-destination`,
    bounced.pathname === '/login' && carried === dest.path,
    `${dest.path} (${dest.note}) bounced to ${bounced.pathname} carrying ${JSON.stringify(carried)}`,
  )

  await signInHere(page, who)
  await page.waitForLoadState('networkidle')
  const landed = new URL(page.url())
  check(
    `${width}.${dest.id}.and-signing-in-lands-there`,
    landed.pathname === dest.path,
    `asked for ${dest.path}, landed on ${landed.pathname}`,
  )

  const file = join(out, `${tag}-${width}-${dest.id}-landed.png`)
  await page.screenshot({ path: file, fullPage: false })
  check(`${width}.${dest.id}.photographed`, true, file)
  await context.close()
}

/* ------------------------------------------------------------------------- */
/* The refusal, at 390 only. See the header for why one width and not three.  */
/* ------------------------------------------------------------------------- */

if (width === 390) {
  /*
   * `.invalid` IS RESERVED AND NEVER RESOLVES (RFC 2606 section 2), which is the
   * point: an earlier run of this drive actually navigated a real browser to
   * `http://evil.com/` while proving the defect, and a drive that proves an open
   * redirect by exercising it against somebody else's domain is sending real
   * traffic to a third party to make a point about our own code.
   */
  const OFF_ORIGIN = `/${String.fromCharCode(92)}not-our-origin.invalid`

  /*
   * BOTH SPELLINGS, AND THE SECOND ONE IS THE WHOLE POINT.
   *
   * The first version of this case drove only `?next=`, and it passed against
   * the BROKEN code, which is a case that proves nothing: the old form did not
   * read `next` at all, so the poisoned value never reached its weak check and
   * the drive was watching the deep-link defect rather than the open redirect.
   *
   * `?redirect=` is the spelling the old form DID read, and its inline check
   * accepted a backslash. That is the one that lands off-origin on the old code
   * and is refused on this one.
   */
  for (const spelling of ['redirect', 'next']) {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/login?${spelling}=${encodeURIComponent(OFF_ORIGIN)}`, {
      waitUntil: 'domcontentloaded',
    })
    await signInHere(page, who)
    await page.waitForLoadState('networkidle')
    const landed = new URL(page.url())
    check(
      `390.refusal.${spelling}.an-off-origin-destination-is-refused`,
      landed.origin === new URL(BASE).origin,
      `?${spelling}=${OFF_ORIGIN}, which resolves to ${new URL(OFF_ORIGIN, BASE).origin}; landed on ${landed.href}`,
    )
    check(
      `390.refusal.${spelling}.and-the-person-is-still-signed-in-somewhere-useful`,
      landed.pathname === '/dashboard',
      `landed on ${landed.pathname}, the default destination, rather than being stranded`,
    )
    const file = join(out, `${tag}-390-refusal-${spelling}-landed.png`)
    await page.screenshot({ path: file, fullPage: false })
    check(`390.refusal.${spelling}.photographed`, true, file)
    await context.close()
  }
}

await browser.close()
finish()
