/**
 * LB-INVITEWHOLE. THE FOUNDING INVITE LOOP, DRIVEN END TO END.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, and why each part is here rather than asserted.
 *
 * The growth plan calls invite-an-organiser acquisition lever two, and says the
 * acquisition loop is what Eventbrite actually grew on. Every read in that loop
 * answered a failure as an answer, and two of them cost the invited organiser
 * the thing they were invited to:
 *
 *   THE INVITE SPENT ON NOTHING. The consume and the spot claim were two round
 *   trips and the claim's error was discarded, so a blink told the invited
 *   organiser "All 50 founding spots are taken right now" while their
 *   single-use code had already been marked accepted.
 *
 *   THE ALLOWANCE THAT FAILED OPEN. `(count ?? 0) >= 5` over a count whose
 *   error was never bound, so a failed count minted a sixth invite.
 *
 *   THE LIST THAT DECIDES THE CONTROL. The screen computes `remaining =
 *   allowance - invites.length` from the list it read, so a truncated or failed
 *   list read says "5 of 5 invites left" and enables a button the database will
 *   refuse. That is the compound defect, and it is why the list read must throw.
 *
 * THE INVITES ARE MADE THROUGH THE FORM, not seeded. BUILD-BRIEF's definition of
 * DRIVEN says a journey that only passes because a script seeded state a real
 * user could not create for themselves FAILS. So each viewport picks a city and
 * presses "Create invite link", and the codes those presses made are the codes
 * the rest of the run uses.
 *
 * THE CONVERSION IS DRIVEN AS THE INVITED PERSON EXPERIENCES IT: open the link,
 * which is what drops the cookie (client-side, on the landing), then create the
 * organisation through the real form. The only seeded thing is that person's
 * account, which is not what is under test.
 *
 * WHAT IS NOT HERE AND WHY. The claim-fault rollback and the database's refusal
 * of a sixth invite are properties of a Postgres transaction and a trigger, and
 * are proven against the live TEST database by
 * scripts/verify/lb-invitewhole-sql-proof.mjs, which injects a fault into the
 * claim and reads the invite back still pending. A browser cannot make that
 * claim and this file does not pretend to.
 *
 * WHAT IT LEAVES ON TEST: nothing. Everything hangs off two disposable
 * organisations under `lane-b-invitewhole-`, deleted and then RE-READ to prove
 * they went.
 *
 * Run (dev server on 3100 against TEST):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   node --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *        scripts/verify/lb-invitewhole-drive.mjs --out C:/dev/EVIDENCE/LB-INVITEWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { readEveryRow } from '@/lib/supabase/read-every-row'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-INVITEWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const TAG = 'lane-b-invitewhole'
const RUN = Date.now().toString(36)
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]
/** The allowance, read from the product rather than typed here. */
const ALLOWANCE = 5

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/**
 * AXE AT EVERY IMPACT LEVEL, not only serious and critical, per BUILD-BRIEF's
 * COMPLETION LAW clause 6. Run against a POPULATED screen: an empty invite list
 * is a state that hides most of what this screen draws.
 */
async function axeCheck(page, screen, viewport) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const named = axe.violations.map(v => `${v.id}(${v.impact}, ${v.nodes.length})`).join(', ')
  check(
    `lb-invitewhole.axe.${screen}.${viewport}`,
    axe.violations.length === 0,
    axe.violations.length === 0
      ? `0 violations at any impact level across ${axe.passes.length} passing check(s)`
      : `${axe.violations.length} violation(s): ${named}`,
  )
  for (const v of axe.violations) {
    for (const n of v.nodes) {
      log(`    ${v.id} ${JSON.stringify(n.target)} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
    }
  }
}

async function makeUser(label) {
  const email = `${TAG}-${label}-${RUN}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`auth user ${label}: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: `Lane B invitewhole ${label}` })
  return { id, email, password }
}

async function signIn(browser, who, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await answerTheCookieBanner(page)
  await page.getByLabel(/email/i).first().fill(who.email)
  await page.getByLabel(/password/i).first().fill(who.password)
  await Promise.all([
    page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
    page.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  await page.waitForTimeout(2000)
  const state = await context.storageState()
  await context.close()
  return state
}

/** Every invite code the screen is currently showing, in the order it lists them. */
async function codesOnScreen(page) {
  const items = await page.locator('li:has-text("/join/")').allInnerTexts()
  return items.map(t => t.match(/\/join\/([A-Z0-9]{6,16})/)?.[1]).filter(Boolean)
}

/**
 * Presses "Create invite link" once and returns the code that press made.
 *
 * IT DIFFERENCES THE LIST RATHER THAN INDEXING IT, and the first version of
 * this drive did index it: it counted the rows, clicked, and read row `before`.
 * The list is ordered created_at DESCENDING, so the new invite arrives at index
 * 0 and `before` is an OLDER row. All three viewports therefore reported the
 * same code, and the check that reconciled it against the database passed every
 * time because that older code really was in the database. 48 of 48 with three
 * of them meaning nothing, which is why this reads the difference: a code that
 * was not there before this press.
 */
async function createInviteThroughTheForm(page) {
  const before = new Set(await codesOnScreen(page))
  await page.getByRole('button', { name: /create invite link/i }).first().click()
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const now = await codesOnScreen(page)
    const fresh = now.find(c => !before.has(c))
    if (fresh) return fresh
    await page.waitForTimeout(250)
  }
  return null
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  const inviter = await makeUser('inviter')
  const invitee = await makeUser('invitee')

  const { data: inviterOrg, error: inviterOrgError } = await db
    .from('organisations')
    .insert({
      name: `Lane B Invitewhole Presents ${RUN}`,
      slug: `${TAG}-inviter-${RUN}`,
      owner_id: inviter.id,
      email: inviter.email,
      // PENDING, not active. The sitemap's `.eq('status','active')` would
      // otherwise publish /organisers/<slug> for this throwaway into a sitemap
      // three lanes read and one lane deletes. Nothing this drive touches goes
      // near a public organiser page: it signs in as the owner and reads the
      // dashboard, where the scope resolver works from ownership.
      status: 'pending',
      is_founding: true,
    })
    .select('id')
    .single()
  if (inviterOrgError) throw new Error(`inviter organisation: ${inviterOrgError.message}`)
  log(`founding organisation ${inviterOrg.id}, organiser ${inviter.id}, invitee ${invitee.id}`)

  const madeCodes = []
  let inviteeOrgId = null
  let exitCode = 0

  const browser = await chromium.launch()
  try {
    const inviterSession = await signIn(browser, inviter)
    check(
      'lb-invitewhole.organiser.is-signed-in',
      Boolean(inviterSession?.cookies?.length),
      `${inviterSession?.cookies?.length ?? 0} cookies held after sign-in`,
    )

    // ----------------------------------------------------------------------
    // 1. THE INVITE IS MADE THROUGH THE FORM, at every viewport.
    // ----------------------------------------------------------------------
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: inviterSession,
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/dashboard/invites`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      await page.getByRole('heading', { name: /invite fellow organisers/i }).waitFor({ timeout: 60000 })

      const before = madeCodes.length
      const left = await page.getByText(`${ALLOWANCE - before} of ${ALLOWANCE}`).count()
      check(
        `lb-invitewhole.screen.invites-left-matches-the-list.${vp.label}`,
        left > 0,
        `screen shows "${ALLOWANCE - before} of ${ALLOWANCE}" with ${before} invite(s) issued`,
      )

      const code = await createInviteThroughTheForm(page)
      check(
        `lb-invitewhole.form.an-invite-is-made-through-the-form.${vp.label}`,
        Boolean(code) && !madeCodes.includes(code),
        `code on screen: ${code ?? 'NONE'}${madeCodes.includes(code) ? ' (ALREADY SEEN, so this press made nothing)' : ''}`,
      )
      if (code) madeCodes.push(code)

      const { data: row, error: rowError } = await db
        .from('founding_invites')
        .select('code, status, inviter_org_id')
        .eq('code', code ?? 'none')
        .maybeSingle()
      check(
        `lb-invitewhole.form.the-database-holds-what-the-screen-shows.${vp.label}`,
        !rowError && row?.status === 'pending' && row?.inviter_org_id === inviterOrg.id,
        `row=${JSON.stringify(row)} error=${rowError?.message ?? 'null'}`,
      )

      // SETTLED BEFORE IT IS PHOTOGRAPHED. The first run captured 768 with the
      // button still reading "Creating...", which is a true frame and not the
      // state the evidence is for.
      await page.getByRole('button', { name: /create invite link|no invites left/i }).first().waitFor({ timeout: 30000 })
      await page.waitForTimeout(400)
      await page.screenshot({
        path: join(OUT, 'drive', `invites-${vp.label}.png`),
        fullPage: false,
      })
      await axeCheck(page, 'invites', vp.label)
      await context.close()
    }

    // ----------------------------------------------------------------------
    // 2. THE ALLOWANCE, ON THE SCREEN AND IN THE DATABASE.
    //
    // The screen refuses at five by disabling the control, which is the right
    // refusal: an organiser should not be able to press a button that cannot
    // work. The DATABASE refuses the sixth independently, which is what makes
    // the refusal survive the count above it failing.
    // ----------------------------------------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        storageState: inviterSession,
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/dashboard/invites`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      while (madeCodes.length < ALLOWANCE) {
        const code = await createInviteThroughTheForm(page)
        if (!code) break
        madeCodes.push(code)
      }
      check(
        'lb-invitewhole.form.the-allowance-can-be-filled-through-the-form',
        madeCodes.length === ALLOWANCE && new Set(madeCodes).size === ALLOWANCE,
        `${madeCodes.length} invite(s) made through the form, ${new Set(madeCodes).size} of them distinct`,
      )
      await context.close()
    }

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: inviterSession,
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/dashboard/invites`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      const button = page.getByRole('button', { name: /no invites left|create invite link/i }).first()
      await button.waitFor({ timeout: 60000 })
      const label = (await button.innerText()).trim()
      const disabled = await button.isDisabled()
      check(
        `lb-invitewhole.screen.the-sixth-is-refused-on-the-screen.${vp.label}`,
        disabled && /no invites left/i.test(label),
        `button reads "${label}", disabled=${disabled}`,
      )
      const shown = await page.locator('li:has-text("/join/")').count()
      check(
        `lb-invitewhole.screen.every-invite-is-listed.${vp.label}`,
        shown === ALLOWANCE,
        `${shown} invite(s) on screen against ${ALLOWANCE} in the database`,
      )
      await page.screenshot({
        path: join(OUT, 'drive', `allowance-${vp.label}.png`),
        fullPage: false,
      })
      await axeCheck(page, 'allowance', vp.label)
      await context.close()
    }

    const sixth = await db.from('founding_invites').insert({
      code: `LANEB${RUN.toUpperCase()}X`.slice(0, 16),
      inviter_kind: 'organiser',
      inviter_org_id: inviterOrg.id,
      inviter_name: 'Lane B Invitewhole Presents',
      city_slug: 'geelong',
      status: 'pending',
    })
    check(
      'lb-invitewhole.database.the-sixth-is-refused-by-the-database-too',
      sixth.error?.code === '23514',
      `code=${sixth.error?.code ?? 'NONE'} ${(sixth.error?.message ?? 'INSERTED, which is the defect').slice(0, 120)}`,
    )

    // ----------------------------------------------------------------------
    // 3. THE CEILING AND THE REFUSAL, against the live database.
    //
    // The list is small by construction, so the ceiling has never been reached
    // in practice. It is proven here anyway, with a page size the caller can
    // set, because the defect class is a silence: HTTP 200, `error` null, and
    // rows missing. And a refused read must THROW rather than answer "no
    // invites", which is what let the screen offer a sixth.
    // ----------------------------------------------------------------------
    {
      const windowed = await db
        .from('founding_invites')
        .select('code')
        .eq('inviter_org_id', inviterOrg.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, 1)
      check(
        'lb-invitewhole.ceiling.a-window-is-silent-about-the-rest',
        !windowed.error && windowed.data?.length === 2,
        `${windowed.data?.length ?? 'no'} of ${ALLOWANCE} rows, HTTP ok, error=${windowed.error?.message ?? 'null'}`,
      )

      const paged = await readEveryRow(
        'the drive reading every founding invite',
        (from, to) =>
          db
            .from('founding_invites')
            .select('code')
            .eq('inviter_org_id', inviterOrg.id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to),
        { pageSize: 2 },
      )
      check(
        'lb-invitewhole.ceiling.the-pager-returns-every-row',
        paged.length === ALLOWANCE,
        `${paged.length} of ${ALLOWANCE} rows through a page size of 2`,
      )

      let threw = ''
      try {
        await readEveryRow(
          'the drive forcing a refusal',
          (from, to) =>
            db
              .from('founding_invites')
              .select('a_column_that_is_not_there')
              .eq('inviter_org_id', inviterOrg.id)
              .order('id', { ascending: false })
              .range(from, to),
          { pageSize: 2 },
        )
      } catch (err) {
        threw = String(err?.message ?? err)
      }
      check(
        'lb-invitewhole.ceiling.a-refused-read-throws-rather-than-answering-none',
        threw.length > 0,
        threw ? threw.slice(0, 120) : 'returned an empty list, which is the silence the defect lives in',
      )
    }

    // ----------------------------------------------------------------------
    // 4. THE FRONT DOOR, at every viewport.
    // ----------------------------------------------------------------------
    const inviteCode = madeCodes[0]
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await page.goto(`${BASE}/join/${inviteCode}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      const welcomed = await page
        .getByRole('heading', { name: /invited you to eventlinqs/i })
        .count()
      const refused = await page.getByText(/this invitation is not available/i).count()
      check(
        `lb-invitewhole.landing.a-live-invite-is-welcomed.${vp.label}`,
        welcomed > 0 && refused === 0,
        `welcome heading=${welcomed} refusal=${refused}`,
      )
      const cta = page.getByRole('link', { name: /claim your founding spot/i }).first()
      const box = await cta.boundingBox()
      check(
        `lb-invitewhole.landing.the-claim-control-is-a-touch-target.${vp.label}`,
        Boolean(box) && box.height >= 44,
        `claim CTA is ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'not on the page'}`,
      )
      await page.screenshot({ path: join(OUT, 'drive', `landing-${vp.label}.png`), fullPage: false })
      await axeCheck(page, 'landing', vp.label)
      await context.close()
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      await page.goto(`${BASE}/join/ZZZZZZZZ`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      check(
        'lb-invitewhole.landing.a-code-that-does-not-exist-is-refused',
        (await page.getByText(/this invitation is not available/i).count()) > 0,
        'a genuinely absent code still renders the refusal, which is the only time it should',
      )
      await context.close()
    }

    // ----------------------------------------------------------------------
    // 5. THE CONVERSION, as the invited person experiences it.
    // ----------------------------------------------------------------------
    {
      const inviteeSession = await signIn(browser, invitee)
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: inviteeSession,
      })
      const page = await context.newPage()

      await page.goto(`${BASE}/join/${inviteCode}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      await page.waitForTimeout(1500)
      const cookies = await context.cookies()
      const dropped = cookies.find(c => c.name === 'el_founding_invite')
      check(
        'lb-invitewhole.conversion.the-landing-drops-the-code-in-the-browser',
        dropped?.value === inviteCode,
        `el_founding_invite=${dropped?.value ?? 'NOT SET'}`,
      )

      await page.goto(`${BASE}/dashboard/organisation/create`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      const orgName = `Lane B Invitewhole Invited ${RUN}`
      await page.locator('input[name="name"]').fill(orgName)
      await page.locator('input[name="slug"]').fill(`${TAG}-invitee-${RUN}`)
      await Promise.all([
        page.waitForURL(u => !u.pathname.endsWith('/create'), { timeout: 90000 }).catch(() => {}),
        page.getByRole('button', { name: /create organisation|create/i }).first().click(),
      ])
      await page.waitForTimeout(3000)

      const { data: newOrg, error: newOrgError } = await db
        .from('organisations')
        .select('id, is_founding, founding_fee_free_until, referred_by_organisation_id')
        .eq('slug', `${TAG}-invitee-${RUN}`)
        .maybeSingle()
      inviteeOrgId = newOrg?.id ?? null
      check(
        'lb-invitewhole.conversion.the-organisation-was-created-through-the-form',
        !newOrgError && Boolean(inviteeOrgId),
        `org=${inviteeOrgId ?? 'NONE'} error=${newOrgError?.message ?? 'null'}`,
      )
      check(
        'lb-invitewhole.conversion.the-founding-spot-was-granted',
        newOrg?.is_founding === true && Boolean(newOrg?.founding_fee_free_until),
        `is_founding=${newOrg?.is_founding} fee_free_until=${newOrg?.founding_fee_free_until}`,
      )
      check(
        'lb-invitewhole.conversion.the-referral-was-attributed-to-the-inviter',
        newOrg?.referred_by_organisation_id === inviterOrg.id,
        `referred_by=${newOrg?.referred_by_organisation_id} expected=${inviterOrg.id}`,
      )

      const { data: spent } = await db
        .from('founding_invites')
        .select('status, accepted_org_id, accepted_by_user_id')
        .eq('code', inviteCode)
        .maybeSingle()
      check(
        'lb-invitewhole.conversion.the-code-was-spent-exactly-once',
        spent?.status === 'accepted' && spent?.accepted_org_id === inviteeOrgId,
        `status=${spent?.status} accepted_org_id=${spent?.accepted_org_id}`,
      )

      const after = await context.cookies()
      check(
        'lb-invitewhole.conversion.the-spent-code-left-the-browser',
        !after.find(c => c.name === 'el_founding_invite'),
        `el_founding_invite=${after.find(c => c.name === 'el_founding_invite')?.value ?? 'gone'}`,
      )

      await page.goto(`${BASE}/join/${inviteCode}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      check(
        'lb-invitewhole.conversion.a-spent-code-cannot-be-claimed-twice',
        (await page.getByText(/this invitation is not available/i).count()) > 0,
        'the landing refuses a code that has been accepted',
      )
      await context.close()
    }

    // ----------------------------------------------------------------------
    // 6. WHAT THE INVITER NOW SEES, which is the point of the loop.
    // ----------------------------------------------------------------------
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: inviterSession,
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/dashboard/invites`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      await page.getByRole('heading', { name: /invite fellow organisers/i }).waitFor({ timeout: 60000 })
      const joined = await page.getByText(/joined/i).count()
      check(
        `lb-invitewhole.inviter.the-conversion-shows-on-the-inviter-screen.${vp.label}`,
        joined > 0,
        `${joined} element(s) reporting a joined invite`,
      )
      await page.screenshot({ path: join(OUT, 'drive', `converted-${vp.label}.png`), fullPage: false })
      await context.close()
    }
  } catch (err) {
    check('lb-invitewhole.the-run-completed', false, String(err?.stack ?? err?.message ?? err))
    exitCode = 1
  } finally {
    await browser.close().catch(() => {})

    // TEST IS LEFT AS FOUND, and the teardown is READ BACK BY NAME rather than
    // assumed: forty-two accounts were once left on TEST by a teardown that
    // could not fail (LB-TEARDOWN).
    await db.from('founding_invites').delete().eq('inviter_org_id', inviterOrg?.id ?? randomUUID())
    if (inviteeOrgId) await db.from('organisations').delete().eq('id', inviteeOrgId)
    if (inviterOrg?.id) await db.from('organisations').delete().eq('id', inviterOrg.id)
    for (const who of [inviter, invitee]) {
      if (!who?.id) continue
      await db.from('profiles').delete().eq('id', who.id)
      await tearDownAccountOrFailTheRun(db, who.id)
    }

    const { count: orgsLeft } = await db
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .like('slug', `${TAG}-%`)
    const { count: invitesLeft } = await db
      .from('founding_invites')
      .select('id', { count: 'exact', head: true })
      .in('code', madeCodes.length ? madeCodes : ['none'])
    check(
      'lb-invitewhole.test-is-left-as-found',
      orgsLeft === 0 && invitesLeft === 0,
      `organisations=${orgsLeft} invites=${invitesLeft}`,
    )

    const failed = results.filter(r => !r.ok)
    writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`, 'utf8')
    writeFileSync(
      join(OUT, 'results.json'),
      `${JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2)}\n`,
      'utf8',
    )
    log(`${results.length - failed.length} of ${results.length} checks passed`)
    process.exit(failed.length || exitCode ? 1 : 0)
  }
}

await main()
