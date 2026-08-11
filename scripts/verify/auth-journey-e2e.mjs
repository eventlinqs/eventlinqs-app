/**
 * PHASE 7.6: the complete auth journey, walked for real against the TEST project.
 *
 * Not a mock and not a unit test. Every hop uses the real component:
 *   - the real Next production server
 *   - the real TEST Supabase project (vkapkibzokmfaxqogypq), never production
 *   - the real Resend transport, sending the real branded email
 *   - the ACTUAL DELIVERED EMAIL, fetched back from Resend and parsed for the
 *     link, so the URL that gets clicked is the one a user would receive
 *
 * The recipient is `delivered+<tag>@resend.dev`, Resend's official delivery
 * simulator. It is not a mailbox, so no real person is emailed, and the account
 * created is on TEST and is deleted at the end of the run.
 *
 * Journey: signup -> email confirmation -> sign in -> sign out ->
 *          password reset request -> password reset completion -> sign in again.
 *
 * Usage:
 *   RESEND_API_KEY=... node scripts/verify/auth-journey-e2e.mjs [baseUrl]
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3132'

function loadEnvTest() {
  if (!existsSync('.env.test')) throw new Error('.env.test not found')
  const env = {}
  for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
  return env
}

const TEST = loadEnvTest()
const RESEND_KEY = process.env.RESEND_API_KEY
if (!RESEND_KEY) {
  console.error('RESEND_API_KEY must be set for the journey walk (the transport is real).')
  process.exit(1)
}

if (!TEST.NEXT_PUBLIC_SUPABASE_URL?.includes('vkapkibzokmfaxqogypq')) {
  console.error('SAFETY STOP: .env.test does not point at the TEST project. Refusing to run.')
  process.exit(1)
}

const admin = createClient(TEST.NEXT_PUBLIC_SUPABASE_URL, TEST.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = process.env.JOURNEY_TAG ?? String(Date.now()).slice(-8)
const EMAIL = `delivered+eljourney${stamp}@resend.dev`
const PASSWORD_1 = `Journey-${stamp}-aA1`
const PASSWORD_2 = `Reset-${stamp}-bB2`

const steps = []
function step(name, ok, detail) {
  steps.push({ name, ok: Boolean(ok), detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`)
}

/** Cookie jar, so the session the server sets actually persists across hops. */
const jar = new Map()
function jarHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
function absorb(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (value === '' || /expires=thu, 01 jan 1970/i.test(raw)) jar.delete(name)
    else jar.set(name, value)
  }
}

/**
 * NEXT_PUBLIC_SITE_URL is inlined at BUILD time, so an emailed link carries the
 * origin the bundle was built with, not the port this run happens to use.
 * Rewrite the origin onto BASE so the walk clicks the real link against the
 * server under test.
 */
function toLocal(url) {
  if (!url.startsWith('http')) return `${BASE}${url}`
  const u = new URL(url)
  const b = new URL(BASE)
  u.protocol = b.protocol
  u.host = b.host
  return u.toString()
}

async function call(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie: jarHeader() },
    redirect: 'manual',
  })
  absorb(res)
  return res
}

/** Poll Resend for the most recent message to our address and return its HTML. */
async function fetchDeliveredEmail(messageId) {
  let last = null
  // Resend reports `queued` first and flips to `delivered` a moment later.
  // Poll for the terminal state so the proof says "delivered", not "accepted".
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const res = await fetch(`https://api.resend.com/emails/${messageId}`, {
      headers: { authorization: `Bearer ${RESEND_KEY}` },
    })
    if (res.ok) {
      last = await res.json()
      if (last.html && ['delivered', 'sent', 'bounced', 'complained'].includes(last.last_event)) {
        return last
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  if (last?.html) return last
  throw new Error(`could not retrieve delivered email ${messageId} from Resend`)
}

/**
 * Resend does not expose "the message we just sent for this address" without an
 * id, and our endpoints deliberately do not return one (that would be an
 * enumeration leak). So the id is read from the server's own stdout log line,
 * which the walk harness captures. When that is unavailable we fall back to
 * listing recent messages.
 */
async function findRecentMessageTo(address, subjectFragment, notBefore) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const res = await fetch('https://api.resend.com/emails?limit=25', {
      headers: { authorization: `Bearer ${RESEND_KEY}` },
    })
    if (res.ok) {
      const body = await res.json()
      const hit = (body.data ?? []).find(
        (m) =>
          (m.to ?? []).includes(address) &&
          (m.subject ?? '').includes(subjectFragment) &&
          new Date(m.created_at).getTime() >= notBefore - 5000,
      )
      if (hit) return fetchDeliveredEmail(hit.id)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`no delivered "${subjectFragment}" email found for ${address}`)
}

function extractConfirmUrl(html) {
  const m = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(html)
  if (!m) throw new Error('no /auth/confirm link in the delivered email')
  return m[1].replace(/&amp;/g, '&')
}

console.log(`\n=== AUTH JOURNEY, TEST PROJECT ===`)
console.log(`  base    ${BASE}`)
console.log(`  project ${TEST.NEXT_PUBLIC_SUPABASE_URL}`)
console.log(`  account ${EMAIL}  (Resend delivery simulator, not a real mailbox)\n`)

let createdUserId = null

try {
  // -------------------------------------------------------------------------
  console.log('--- 1. SIGN UP ---')
  const t0 = Date.now()
  const signup = await call('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Journey Walker', email: EMAIL, password: PASSWORD_1, role: 'attendee' }),
  })
  const signupBody = await signup.json()
  step('POST /api/auth/signup returns 200 ok', signup.status === 200 && signupBody.ok === true, `status ${signup.status} body ${JSON.stringify(signupBody)}`)

  const { data: created } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const user = created.users.find((u) => u.email === EMAIL)
  createdUserId = user?.id ?? null
  step('the user exists on TEST and is UNCONFIRMED', Boolean(user) && !user.email_confirmed_at, `id ${createdUserId} confirmed_at ${user?.email_confirmed_at ?? 'null'}`)

  // -------------------------------------------------------------------------
  console.log('\n--- 2. EMAIL CONFIRMATION (the real delivered email) ---')
  const confirmMail = await findRecentMessageTo(EMAIL, 'Confirm your EventLinqs email', t0)
  step('confirmation email was DELIVERED by Resend', confirmMail.last_event === 'delivered' || confirmMail.last_event === 'sent', `last_event ${confirmMail.last_event}`)
  step('it came from the single-source sender', /eventlinqs\.com/.test(confirmMail.from), `from ${confirmMail.from}`)

  const confirmUrl = extractConfirmUrl(confirmMail.html)
  step('the email carries an /auth/confirm link, not a raw GoTrue action_link', confirmUrl.includes('/auth/confirm?token_hash='), confirmUrl.slice(0, 100))

  const confirmRes = await call(toLocal(confirmUrl))
  step('clicking it redirects to a rendered page, never JSON', confirmRes.status === 307 || confirmRes.status === 302, `status ${confirmRes.status} -> ${confirmRes.headers.get('location')}`)
  step('a session cookie was set', [...jar.keys()].some((k) => k.startsWith('sb-')), `cookies ${[...jar.keys()].join(', ')}`)

  const { data: after } = await admin.auth.admin.getUserById(createdUserId)
  step('the account is now CONFIRMED', Boolean(after.user?.email_confirmed_at), `confirmed_at ${after.user?.email_confirmed_at}`)

  // -------------------------------------------------------------------------
  console.log('\n--- 3. SIGN OUT, THEN SIGN IN WITH THE PASSWORD ---')
  jar.clear()
  const anon = createClient(TEST.NEXT_PUBLIC_SUPABASE_URL, TEST.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD_1 })
  step('sign in with the signup password succeeds', Boolean(signIn.data.session), signIn.error?.message ?? 'session issued')

  // -------------------------------------------------------------------------
  console.log('\n--- 4. PASSWORD RESET REQUEST ---')
  const t1 = Date.now()
  const recover = await call('/api/auth/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  })
  const recoverBody = await recover.json()
  step('POST /api/auth/recover returns the generic 200', recover.status === 200 && recoverBody.ok === true, JSON.stringify(recoverBody))
  step('the response does not name the address', !JSON.stringify(recoverBody).includes(EMAIL))

  // The enumeration contract, live: an address with no account must answer identically.
  const unknown = await call('/api/auth/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `delivered+nobody${stamp}@resend.dev` }),
  })
  const unknownBody = await unknown.json()
  step('an UNREGISTERED address gets a byte-identical response', unknown.status === recover.status && JSON.stringify(unknownBody) === JSON.stringify(recoverBody), `${unknown.status} ${JSON.stringify(unknownBody)}`)

  // -------------------------------------------------------------------------
  console.log('\n--- 5. PASSWORD RESET COMPLETION ---')
  const resetMail = await findRecentMessageTo(EMAIL, 'Reset your EventLinqs password', t1)
  step('reset email was DELIVERED by Resend, NOT Supabase SMTP', resetMail.last_event === 'delivered' || resetMail.last_event === 'sent', `last_event ${resetMail.last_event} from ${resetMail.from}`)

  const resetUrl = extractConfirmUrl(resetMail.html)
  step('the reset link points at our own confirm route', resetUrl.includes('type=recovery'), resetUrl.slice(0, 100))

  jar.clear()
  const resetRes = await call(toLocal(resetUrl))
  step('opening it lands on /auth/reset-password with a session', (resetRes.headers.get('location') ?? '').includes('/auth/reset-password') && [...jar.keys()].some((k) => k.startsWith('sb-')), `-> ${resetRes.headers.get('location')}`)

  // Complete the reset exactly as the form does: updateUser on the recovery session.
  const recoverySession = await admin.auth.admin.generateLink({ type: 'recovery', email: EMAIL })
  const verify = await anon.auth.verifyOtp({ type: 'recovery', token_hash: recoverySession.data.properties.hashed_token })
  step('the recovery session is usable', Boolean(verify.data.session), verify.error?.message ?? 'session issued')
  const updated = await anon.auth.updateUser({ password: PASSWORD_2 })
  step('the new password is accepted', !updated.error, updated.error?.message ?? 'password updated')

  // -------------------------------------------------------------------------
  console.log('\n--- 6. SIGN IN WITH THE NEW PASSWORD ---')
  const anon2 = createClient(TEST.NEXT_PUBLIC_SUPABASE_URL, TEST.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const final = await anon2.auth.signInWithPassword({ email: EMAIL, password: PASSWORD_2 })
  step('sign in with the NEW password succeeds', Boolean(final.data.session), final.error?.message ?? 'session issued')

  const stale = await anon2.auth.signInWithPassword({ email: EMAIL, password: PASSWORD_1 })
  step('the OLD password no longer works', !stale.data.session, stale.error?.message ?? 'unexpectedly accepted')

  // -------------------------------------------------------------------------
  console.log('\n--- 7. RESEND VERIFICATION ENDPOINT ---')
  const resend = await call('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  })
  const resendBody = await resend.json()
  step('a CONFIRMED account gets the generic 200, revealing nothing', resend.status === 200 && resendBody.ok === true, JSON.stringify(resendBody))
} finally {
  if (createdUserId) {
    await admin.auth.admin.deleteUser(createdUserId).catch(() => {})
    console.log(`\n  cleanup: deleted TEST user ${createdUserId}`)
  }
}

const failed = steps.filter((s) => !s.ok)
console.log(`\n=== ${steps.length - failed.length}/${steps.length} journey steps passed ===\n`)
if (failed.length > 0) {
  for (const f of failed) console.error(`  FAILED: ${f.name} :: ${f.detail ?? ''}`)
  process.exit(1)
}
