/**
 * S1 DRIVEN PROOF: the false alarm is gone from both surfaces that carried it,
 * the check that replaced it is on the owner's screen, and the daily email it
 * writes fits on a phone.
 *
 * WHAT IT DRIVES, AND WHAT IT DELIBERATELY DOES NOT CLAIM.
 *
 * DRIVEN, through the real interface, at 390, 768 and 1440:
 *
 *   1. The owner signs in at the real /admin/login and opens /admin/health. The
 *      check "Organisers can take money" is on the screen, and the deleted
 *      "Organiser names match Stripe" is not, anywhere in the document.
 *   2. An organiser signs in at the real /login and opens /dashboard/payouts.
 *      The band that told them "Stripe uses its own name on your buyers' bank
 *      statements" is gone. That sentence was false on this platform, which
 *      charges with separate charges and transfers and never sets on_behalf_of,
 *      so Stripe uses the PLATFORM's descriptor
 *      (https://docs.stripe.com/connect/statement-descriptors, fetched
 *      2026-09-11). The page still renders everything else it renders.
 *   3. The real daily heartbeat runs through its real cron route with ?dry=1,
 *      and the email is built by the product's own heartbeatEmail() - the same
 *      function sendHeartbeat hands to Resend, imported rather than copied - and
 *      rendered in the browser at all three widths with no overflow.
 *   4. axe finds zero violations at EVERY impact level on every screen, not only
 *      serious and critical.
 *
 * NOT CLAIMED, and stated here so no reader takes more from a green run than it
 * carries: the AMBER and RED verdicts are NOT exercised against a live Stripe
 * account. Both Stripe CLI keys on this machine answer 401 api_key_expired and
 * every Vercel STRIPE_SECRET_KEY is sensitive, so the check reports its own
 * missing-key state here. The severity table is proved exhaustively by
 * tests/unit/stripe/account-health.test.ts, and the live half needs one command:
 * `stripe login`.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://127.0.0.1:3311 node --import ./scripts/lib/src-alias-loader.mjs \
 *     --env-file=.env.local scripts/verify/s1-account-health-proof.mjs --out C:/dev/EVIDENCE/S1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { heartbeatEmail } from '@/lib/health/runner'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/S1'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

/** The label the deleted check rendered under. Its presence anywhere in the
 *  document is the false alarm having returned. */
const DELETED_LABEL = 'Organiser names match Stripe'
const NEW_LABEL = 'Organisers can take money'
/** The sentence the deleted organiser band used to justify itself, which is
 *  false on this charge type. */
const FALSE_CLAIM = 'on your buyers'

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${id}  ${detail}`)
}

async function makeAdmin() {
  const email = `s1-admin-${randomUUID().slice(0, 8)}@eventlinqs.test`
  const password = `S1-${randomUUID()}`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: 'S1 Proof', display_name: 'S1 Proof', is_verified: true })
  // No totp_secret_encrypted: the product's own documented first-login
  // bootstrap signs an un-enrolled admin in and issues the two-factor proof.
  // No gate is bypassed and no code is modified.
  const { error } = await db.from('admin_users').insert({ id, role: 'super_admin', display_name: 'S1 Proof' })
  if (error) throw new Error(`admin_users insert: ${error.message}`)
  return { id, email, password }
}

async function makeOrganiser() {
  const email = `s1-org-${randomUUID().slice(0, 8)}@eventlinqs.test`
  const password = `S1-${randomUUID()}`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`create organiser auth user: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: 'S1 Organiser', display_name: 'S1 Organiser', is_verified: true })
  const slug = `s1-organiser-${randomUUID().slice(0, 8)}`
  const { data: org, error } = await db
    .from('organisations')
    .insert({ name: 'S1 Proof Organiser', slug, owner_id: id, status: 'active' })
    .select('id')
    .single()
  if (error) throw new Error(`organisations insert: ${error.message}`)
  return { id, email, password, organisationId: org.id }
}

/** Sign in through the REAL form, settling on the first real outcome rather
 *  than racing an empty [role=alert] that is already on the page. */
async function signIn(page, path, who) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('input[name="email"]').first().fill(who.email)
  await page.locator('input[name="password"]').first().fill(who.password)
  const submit = page.locator('button[type="submit"]').first()
  await submit.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 30000 })
  await submit.click()
  await Promise.race([
    page.waitForURL(u => !u.pathname.startsWith(path), { timeout: 60000 }).catch(() => {}),
    page.waitForTimeout(20000),
  ])
  return page.url()
}

async function noOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}

async function axeZero(page, id) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const byImpact = {}
  for (const v of r.violations) byImpact[v.impact ?? 'unknown'] = (byImpact[v.impact ?? 'unknown'] ?? 0) + 1
  writeFileSync(join(out, `axe-${id}.json`), JSON.stringify(r.violations, null, 2))
  check(
    `axe.${id}.zero-at-every-impact-level`,
    r.violations.length === 0,
    r.violations.length === 0 ? '0 violations at every impact level' : `${r.violations.length}: ${JSON.stringify(byImpact)}`,
  )
}

async function main() {
  const admin = await makeAdmin()
  const organiser = await makeOrganiser()
  const browser = await chromium.launch()
  let heartbeatResults = null

  try {
    /* ---- the heartbeat's own check set, from the REAL cron route ---- */
    const dry = await fetch(`${BASE}/api/cron/health-heartbeat?dry=1`, {
      headers: CRON_SECRET ? { authorization: `Bearer ${CRON_SECRET}` } : {},
    })
    if (dry.ok) {
      const body = await dry.json()
      heartbeatResults = body.checks ?? []
      const ids = heartbeatResults.map(c => c.id)
      check('heartbeat.runs', Array.isArray(heartbeatResults) && heartbeatResults.length > 0, `${ids.length} checks ran through the real cron route`)
      check('heartbeat.carries-the-new-check', ids.includes('connect_health'), ids.includes('connect_health') ? 'connect_health is in the daily heartbeat' : `it is not: ${ids.join(', ')}`)
      check('heartbeat.deleted-check-is-gone', !ids.includes('connect_profile'), !ids.includes('connect_profile') ? 'connect_profile is gone from the heartbeat' : 'connect_profile is STILL RUNNING')
      const connect = heartbeatResults.find(c => c.id === 'connect_health')
      check('heartbeat.new-check-is-labelled-for-a-person', connect?.label === NEW_LABEL, `label is "${connect?.label ?? '(absent)'}"`)
      writeFileSync(join(out, 'heartbeat-dry-run.json'), JSON.stringify(body, null, 2))
    } else {
      check('heartbeat.runs', false, `the cron route answered ${dry.status}; CRON_SECRET may be absent from this environment`)
    }

    for (const vp of VIEWPORTS) {
      console.log(`\n== ${vp.label} ==`)
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      })
      const page = await ctx.newPage()
      page.on('pageerror', e => console.log(`    pageerror ${String(e).slice(0, 160)}`))

      /* ---- 1. the owner's health screen ---- */
      const landed = await signIn(page, '/admin/login', admin)
      check(`admin.${vp.label}.signed-in`, !landed.includes('/admin/login'), `landed on ${landed.replace(BASE, '')}`)

      const health = await page.goto(`${BASE}/admin/health`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      check(`health.${vp.label}.status`, health?.status() === 200, `HTTP ${health?.status()}`)
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})

      const text = await page.evaluate(() => document.body.innerText)
      check(`health.${vp.label}.new-check-on-screen`, text.includes(NEW_LABEL), text.includes(NEW_LABEL) ? `"${NEW_LABEL}" is on the screen` : 'it is NOT on the screen')
      check(`health.${vp.label}.deleted-check-not-on-screen`, !text.includes(DELETED_LABEL), !text.includes(DELETED_LABEL) ? `"${DELETED_LABEL}" is gone` : 'the deleted check is STILL RENDERED')

      const hw = await noOverflow(page)
      check(`health.${vp.label}.no-overflow`, hw.scrollWidth <= hw.innerWidth, `scrollWidth ${hw.scrollWidth} against innerWidth ${hw.innerWidth}`)

      /*
       * NOTHING WIDER THAN ITS BOX IS UNREACHABLE (close-out UX6.3).
       *
       * A page-level scrollWidth check cannot see this, because `overflow-hidden`
       * is precisely what hides an overflow from it. Measured before the fix: the
       * health table laid out at 567px inside a 390 viewport, in an
       * `overflow-hidden` wrapper, so 177px of the Detail column - where every
       * answer this item writes ends up - was clipped with no route to it.
       */
      const reach = await page.evaluate(() => {
        const table = document.querySelector('table')
        const box = table?.parentElement
        const tableShown = Boolean(box) && getComputedStyle(box).display !== 'none'
        // Below sm the table is replaced by one card per check, because a
        // four-column diagnostic table cannot be read on a phone even when it
        // scrolls. Whichever layout is on screen, the detail must be readable
        // without going sideways.
        const cards = [...document.querySelectorAll('li')].filter(li => li.querySelector('p'))
        return {
          tableShown,
          tableWidth: tableShown ? Math.round(table.getBoundingClientRect().width) : 0,
          boxWidth: tableShown ? Math.round(box.clientWidth) : 0,
          overflowX: tableShown ? getComputedStyle(box).overflowX : null,
          focusable: tableShown ? box.tabIndex >= 0 : null,
          cards: cards.length,
          widestCard: cards.reduce((w, c) => Math.max(w, Math.round(c.getBoundingClientRect().width)), 0),
          cardDetailChars: cards.reduce((n, c) => n + (c.querySelector('p')?.textContent?.trim().length ?? 0), 0),
        }
      })
      if (reach?.tableShown) {
        check(
          `health.${vp.label}.wider-than-its-box-is-still-reachable`,
          reach.tableWidth <= reach.boxWidth || (['auto', 'scroll'].includes(reach.overflowX) && reach.focusable),
          reach.tableWidth <= reach.boxWidth
            ? `the table fits (${reach.tableWidth} in ${reach.boxWidth})`
            : `the table is ${reach.tableWidth} in a ${reach.boxWidth} box, overflow-x "${reach.overflowX}", keyboard reachable ${reach.focusable}`,
        )
      } else {
        // The phone layout. Every check is a card, its detail is under its name,
        // and no card is wider than the screen.
        check(
          `health.${vp.label}.every-check-is-a-card`,
          (reach?.cards ?? 0) >= 10,
          `${reach?.cards ?? 0} cards, carrying ${reach?.cardDetailChars ?? 0} characters of detail under the name each belongs to`,
        )
        check(
          `health.${vp.label}.no-card-wider-than-the-screen`,
          (reach?.widestCard ?? 0) <= vp.width,
          `widest card ${reach?.widestCard ?? 0} against a ${vp.width} screen`,
        )
      }
      /*
       * NO TEXT THE SAME COLOUR AS WHAT IS BEHIND IT.
       *
       * axe reported ZERO violations at every impact level on this page while
       * three elements were painting white on white: the table's column headers,
       * the severity column, and the "Fix:" line telling the owner what to do
       * about a fault. The cause was `text-ink-500`, a utility globals.css does
       * not define, so the element inherited the admin shell's text-white.
       *
       * A colour-contrast scanner did not catch it and a person reading the page
       * did, which is close-out UX2.5 exactly. This is the smallest assertion
       * that would have.
       */
      const invisible = await page.evaluate(() => {
        const out = []
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
        for (let el = walk.nextNode(); el; el = walk.nextNode()) {
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0)
          if (!own) continue
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
          let bg = style.backgroundColor
          let p = el.parentElement
          while (p && (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)')) {
            bg = getComputedStyle(p).backgroundColor
            p = p.parentElement
          }
          if (style.color === bg) out.push({ colour: style.color, text: el.textContent.trim().slice(0, 60) })
        }
        return out
      })
      check(
        `health.${vp.label}.no-text-the-colour-of-its-background`,
        invisible.length === 0,
        invisible.length === 0
          ? 'every piece of text differs from what is behind it'
          : `${invisible.length} invisible: ${invisible.map(i => `"${i.text}" in ${i.colour}`).join(' | ')}`,
      )

      await page.screenshot({ path: join(out, `01-admin-health-${vp.label}.png`), fullPage: true })
      await axeZero(page, `admin-health-${vp.label}`)

      /* ---- 2. the organiser's payouts screen ---- */
      const orgCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      })
      const orgPage = await orgCtx.newPage()
      orgPage.on('pageerror', e => console.log(`    pageerror ${String(e).slice(0, 160)}`))
      const orgLanded = await signIn(orgPage, '/login', organiser)
      check(`organiser.${vp.label}.signed-in`, !orgLanded.includes('/login'), `landed on ${orgLanded.replace(BASE, '')}`)

      const payouts = await orgPage.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      check(`payouts.${vp.label}.status`, payouts?.status() === 200, `HTTP ${payouts?.status()}`)
      await orgPage.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})

      const payoutsText = await orgPage.evaluate(() => document.body.innerText)
      check(
        `payouts.${vp.label}.false-claim-gone`,
        !payoutsText.includes(FALSE_CLAIM),
        !payoutsText.includes(FALSE_CLAIM)
          ? 'the bank-statement claim is gone from the organiser screen'
          : 'the FALSE bank-statement claim is STILL on the organiser screen',
      )
      check(
        `payouts.${vp.label}.page-still-works`,
        payoutsText.length > 200,
        `${payoutsText.length} characters of page text, so removing the band did not empty the page`,
      )
      const pw = await noOverflow(orgPage)
      check(`payouts.${vp.label}.no-overflow`, pw.scrollWidth <= pw.innerWidth, `scrollWidth ${pw.scrollWidth} against innerWidth ${pw.innerWidth}`)
      await orgPage.screenshot({ path: join(out, `02-organiser-payouts-${vp.label}.png`), fullPage: true })
      await axeZero(orgPage, `organiser-payouts-${vp.label}`)
      await orgCtx.close()

      /* ---- 3. the daily email, built by the product's own function ---- */
      if (heartbeatResults) {
        const email = heartbeatEmail(heartbeatResults, {
          deployment: BASE,
          environment: 'proof',
          when: new Date().toISOString(),
        })
        const mail = await ctx.newPage()
        /*
         * THE VIEWPORT META IS THE HARNESS'S, NOT THE EMAIL'S, AND IT IS WHAT
         * MAKES THE 390 CHECK MEAN ANYTHING.
         *
         * setContent on a document with no viewport meta makes a mobile-emulated
         * Chromium lay out at its 980px fallback width, so the first run of this
         * check reported "scrollWidth 980 against innerWidth 980" for the 390
         * viewport: a pass, measured on a screen three times wider than the one
         * it claimed. It would have passed whatever the email did.
         *
         * A phone mail client lays the body out at the device width (Gmail on
         * Android) or scales it to fit (Apple Mail), so device-width is both the
         * representative case and the stricter one. The email fragment itself is
         * sent exactly as the product builds it; only the document the harness
         * wraps it in carries this tag.
         */
        await mail.setContent(
          `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${email.html}</body></html>`,
          { waitUntil: 'domcontentloaded' },
        )
        const mw = await noOverflow(mail)
        check(`email.${vp.label}.no-overflow`, mw.scrollWidth <= mw.innerWidth, `scrollWidth ${mw.scrollWidth} against innerWidth ${mw.innerWidth}`)
        const mailText = await mail.evaluate(() => document.body.innerText)
        check(`email.${vp.label}.carries-the-new-check`, mailText.includes(NEW_LABEL), mailText.includes(NEW_LABEL) ? 'the email names the new check' : 'it does not')
        check(`email.${vp.label}.deleted-check-gone`, !mailText.includes(DELETED_LABEL), !mailText.includes(DELETED_LABEL) ? 'the deleted check is not in the email' : 'it is STILL in the email')
        await mail.screenshot({ path: join(out, `03-heartbeat-email-${vp.label}.png`), fullPage: true })
        if (vp.label === '390') writeFileSync(join(out, 'heartbeat-email.html'), email.html)
        await mail.close()
      }

      await ctx.close()
    }
  } finally {
    await browser.close()
    await db.from('admin_users').delete().eq('id', admin.id)
    await db.from('organisations').delete().eq('id', organiser.organisationId)
    await db.auth.admin.deleteUser(admin.id).catch(() => {})
    await db.auth.admin.deleteUser(organiser.id).catch(() => {})
  }

  writeFileSync(join(out, 's1-account-health-report.json'), JSON.stringify({ checks, failures, base: BASE, at: new Date().toISOString() }, null, 2))
  console.log('')
  console.log(`${checks.filter(c => c.ok).length} of ${checks.length} checks passed.`)
  if (failures.length > 0) {
    for (const f of failures) console.log(`  ** ${f}`)
    process.exitCode = 1
  } else {
    console.log('The false alarm is gone from both surfaces, the replacement is on the owner\'s screen, and the daily email fits a 390 phone.')
    console.log('NOT claimed: the AMBER and RED verdicts against a live Stripe account. One command: stripe login.')
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
