/**
 * THE FORMS CHECK, ON TEST (the CONTROLLER's 06:20 and 15:10 of 4 November 2026, (3): 'sign up, sign in, magic link,
 * password reset, weekly email sign up, Remind me, organiser sign up, listing claim, contact form, unsubscribe, each read
 * back, a failure fixed in the car'). Each form is submitted the way a visitor submits it, in a browser, and its result
 * is read back from where it lands: the TEST database (service role) or the delivered email (Resend's own record of
 * it). The recipients are Resend's delivery simulator, delivered+<tag>@resend.dev: no real person is ever emailed, and
 * every account it makes on TEST is deleted at the end.
 *
 *   node --env-file=.env.local scripts/verify/forms-check.mjs <base> [--out <dir>]
 *
 * TEST only: it refuses unless the env names the TEST project. Sign up, the email confirmation, sign in, sign out and
 * the password reset are walked by the repo's own scripts/verify/auth-journey-e2e.mjs (it reads the three TEST keys
 * from a .env.test this script writes for the run and removes after).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:3042').replace(/\/$/, '')
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'C:/dev/EVIDENCE/ROUND5-3NOV/forms'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const resendKey = process.env.RESEND_API_KEY ?? ''
if (!url.includes(TEST_REF) || !service) {
  console.error('forms-check runs on TEST only, with the TEST service key in the env')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })
const db = createClient(url, service, { auth: { persistSession: false } })
const stamp = Date.now().toString(36)
const addr = (tag) => `delivered+forms-${tag}-${stamp}@resend.dev`
const results = []
const record = (form, ok, seen) => {
  results.push({ form, ok, seen })
  console.log(`${ok === null ? 'NOT RUN' : ok ? 'PASS' : 'FAIL'} ${form}: ${seen}`)
}

/** The newest email Resend delivered to this address within the wait, or null. */
async function delivered(to, waitMs = 60000) {
  if (!resendKey) return null
  const end = Date.now() + waitMs
  while (Date.now() < end) {
    const res = await fetch('https://api.resend.com/emails?limit=50', { headers: { Authorization: `Bearer ${resendKey}` } })
    if (res.ok) {
      const body = await res.json()
      const hit = (body.data ?? []).find((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(to))
      if (hit) return hit
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  return null
}

const made = []
async function userByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 })
    const u = (data?.users ?? []).find((x) => x.email === email)
    if (u) return u
    if (!data || data.users.length < 200) return null
  }
  return null
}
async function flag(name) {
  const { data } = await db.from('feature_flags').select('enabled').eq('flag', name).maybeSingle()
  return data?.enabled === true
}

// 1 to 4: sign up, the confirmation email, sign in and sign out, the password reset, by the repo's own journey.
{
  const envTest = '.env.test'
  const wrote = !existsSync(envTest)
  if (wrote) {
    writeFileSync(envTest, [`NEXT_PUBLIC_SUPABASE_URL=${url}`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}`, `SUPABASE_SERVICE_ROLE_KEY=${service}`].join('\n') + '\n')
  }
  try {
    const run = spawnSync(process.execPath, ['scripts/verify/auth-journey-e2e.mjs', BASE], { env: process.env, encoding: 'utf8', timeout: 8 * 60 * 1000 })
    writeFileSync(join(OUT, 'auth-journey.txt'), `${run.stdout ?? ''}\n${run.stderr ?? ''}`)
    const tail = `${run.stdout ?? ''}`.trim().split('\n').slice(-2).join(' | ').slice(0, 240)
    record('sign up, email confirmation, sign in, sign out, password reset (auth-journey-e2e)', run.status === 0, `exit ${run.status}; ${tail}`)
  } finally {
    if (wrote) rmSync(envTest, { force: true })
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()

// 5: the magic link, from the sign in page's own button.
try {
  const to = addr('magic')
  await page.goto(`${BASE}/login`, { waitUntil: 'load' })
  await page.getByLabel('Email', { exact: false }).first().fill(to)
  await page.getByRole('button', { name: /magic link/i }).click()
  await page.waitForTimeout(2500)
  const mail = await delivered(to)
  record('magic link', Boolean(mail), mail ? `delivered '${mail.subject}' to the simulator` : 'no email delivered within 60 s')
} catch (e) {
  record('magic link', false, `the form could not be used: ${e.message.slice(0, 160)}`)
}

// 6: organiser sign up (/organisers/signup sends a person to /signup?role=organiser).
try {
  const to = addr('organiser')
  await page.goto(`${BASE}/organisers/signup`, { waitUntil: 'load' })
  await page.getByPlaceholder('Your full name').fill('Forms Check Organiser')
  await page.locator('#email').fill(to)
  await page.locator('#password').fill(`Fc-${stamp}-Aa9!x`)
  await page.getByRole('button', { name: /create|sign up|get started/i }).first().click()
  await page.waitForTimeout(4000)
  const u = await userByEmail(to)
  if (u) made.push(u.id)
  const mail = await delivered(to, 45000)
  const role = u ? JSON.stringify(u.user_metadata ?? {}).slice(0, 120) : ''
  record('organiser sign up', Boolean(u) && Boolean(mail), `${u ? `account made on TEST (${role})` : 'NO account made'}; ${mail ? `confirmation '${mail.subject}' delivered` : 'no confirmation delivered'}; landed on ${new URL(page.url()).pathname}`)
} catch (e) {
  record('organiser sign up', false, `the form could not be used: ${e.message.slice(0, 160)}`)
}

// 7 and 10: the weekly email sign up on the home page, read back from email_subscribers; its confirmation and unsubscribe.
try {
  const to = addr('weekly')
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  const input = page.locator('#email-signup-input')
  await input.scrollIntoViewIfNeeded()
  await input.fill(to)
  const consent = page.locator('input[name="consent"]')
  if (await consent.count()) await consent.first().check()
  await page.locator('form:has(#email-signup-input) [type="submit"]').click()
  await page.waitForTimeout(3000)
  const { data: row } = await db.from('email_subscribers').select('email, consent, confirmed, unsubscribed_at').eq('email', to).maybeSingle()
  const mail = await delivered(to, 45000)
  record('weekly email sign up', Boolean(row), row ? `email_subscribers row: consent ${row.consent}, confirmed ${row.confirmed}` : 'NO row in email_subscribers')
  record('weekly email confirmation (through Resend)', Boolean(mail), mail ? `delivered '${mail.subject}'` : 'NO confirmation email is sent: src/app/actions/email-subscribe.ts inserts the row and sends nothing')
  record('unsubscribe (from the weekly email)', false, mail ? 'see the delivered email for its link' : 'NOTHING TO UNSUBSCRIBE FROM: no email is ever sent to email_subscribers, and the table has no unsubscribe token')
  if (row) await db.from('email_subscribers').delete().eq('email', to)
} catch (e) {
  record('weekly email sign up', false, `the form could not be used: ${e.message.slice(0, 160)}`)
}

// 8: Remind me on a walk in night (its flag, walk_in_remind_me, must be on where the form shows).
try {
  if (!(await flag('walk_in_remind_me'))) {
    record('Remind me', null, 'walk_in_remind_me is OFF on TEST, so the form is not drawn (production holds it off until Lawal approves the privacy version that names it)')
  } else {
    const { data: night } = await db.from('events').select('slug').eq('status', 'published').eq('entry_mode', 'walk_in').gte('start_date', new Date(Date.now() + 86400000).toISOString()).order('start_date').limit(1).maybeSingle()
    if (!night) record('Remind me', null, 'no walk in night ahead on TEST')
    else {
      const to = addr('remind')
      await page.goto(`${BASE}/events/${night.slug}`, { waitUntil: 'load' })
      const form = page.locator('[data-remind-me-form]')
      await form.locator('input[name="email"]').fill(to)
      await form.locator('[type="submit"]').click()
      await page.waitForTimeout(3000)
      const { data: rem } = await db.from('event_reminders').select('id').eq('email', to).limit(1).maybeSingle()
      record('Remind me', Boolean(rem), rem ? `event_reminders row on /events/${night.slug}` : `NO event_reminders row for /events/${night.slug}`)
      if (rem) await db.from('event_reminders').delete().eq('email', to)
    }
  }
} catch (e) {
  record('Remind me', false, `the form could not be used: ${e.message.slice(0, 160)}`)
}

// 9: the listing claim (its flag, listing_claims), its first step read back from listing_claims and its code email.
try {
  if (!(await flag('listing_claims'))) {
    record('listing claim', null, 'listing_claims is OFF on TEST, so the claim pages answer closed (production holds it off until Lawal approves the privacy version that names claims)')
  } else {
    const { data: venue } = await db.from('venues').select('slug').eq('listing_source', 'eventlinqs').is('claimed_at', null).is('removed_at', null).not('slug', 'is', null).limit(1).maybeSingle()
    if (!venue) record('listing claim', null, 'no claimable venue on TEST')
    else {
      const to = addr('claim')
      await page.goto(`${BASE}/venues/${venue.slug}/claim`, { waitUntil: 'load' })
      await page.locator('input[name="name"]').fill('Forms Check')
      await page.locator('input[name="role"]').fill('Owner')
      await page.locator('input[name="email"]').fill(to)
      await page.locator('form:has(input[name="role"]) [type="submit"]').click()
      await page.waitForTimeout(3000)
      const { data: claim } = await db.from('listing_claims').select('id').eq('email', to).limit(1).maybeSingle()
      const mail = await delivered(to, 45000)
      record('listing claim', Boolean(claim) && Boolean(mail), `${claim ? 'listing_claims row made' : 'NO listing_claims row'}; ${mail ? `code email '${mail.subject}' delivered` : 'no code email delivered'}`)
      if (claim) await db.from('listing_claims').delete().eq('id', claim.id)
    }
  }
} catch (e) {
  record('listing claim', false, `the form could not be used: ${e.message.slice(0, 160)}`)
}

// 11: the contact form (a mailto by design, src/components/features/contact/ContactForm.tsx): the mailto it opens, and its success state.
try {
  await page.goto(`${BASE}/contact`, { waitUntil: 'load' })
  await page.evaluate(() => {
    window.__mailto = null
    document.addEventListener('click', () => {}, true)
  })
  await page.getByPlaceholder('Your full name').fill('Forms Check')
  await page.getByPlaceholder('you@example.com').fill(addr('contact'))
  await page.getByPlaceholder("What's your question about?").fill('Forms check')
  await page.getByPlaceholder('Tell us what you need...').fill('The forms check on TEST.')
  const nav = page.waitForEvent('request', { predicate: (r) => r.url().startsWith('mailto:'), timeout: 4000 }).catch(() => null)
  await page.locator('form [type="submit"]').first().click()
  const req = await nav
  await page.waitForTimeout(1200)
  const text = await page.locator('main').innerText()
  const thanked = /thank|sent|on its way|opened your email|mail app/i.test(text)
  record('contact form', thanked, `${req ? `opens ${req.url().slice(0, 60)}` : 'mailto not observed by the browser (headless has no mail client)'}; success state ${thanked ? 'shown' : 'NOT shown'}`)
} catch (e) {
  record('contact form', false, `the form could not be used: ${e.message.slice(0, 160)}`)
}

await browser.close()
for (const id of made) await db.auth.admin.deleteUser(id).catch(() => null)
writeFileSync(join(OUT, 'forms-check.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1))
const pass = results.filter((r) => r.ok === true).length
const fail = results.filter((r) => r.ok === false).length
const notRun = results.filter((r) => r.ok === null).length
console.log(`${pass} PASS, ${fail} FAIL, ${notRun} NOT RUN against ${BASE}`)
process.exit(fail > 0 ? 1 : 0)
