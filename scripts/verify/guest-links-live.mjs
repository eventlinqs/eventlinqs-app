/**
 * DOES THIS DEPLOYMENT ACTUALLY ISSUE GUEST ORDER LINKS?
 *
 * ---------------------------------------------------------------------------
 * THE QUESTION, and why the obvious answers do not answer it.
 *
 * ORDER_ACCESS_SECRET was set on Vercel production on 29 August 2026. "Is it
 * set" is not the question. The question is whether the RUNNING FUNCTIONS mint
 * a link, and those differ: a value on the wrong scope, an empty string, a
 * stray quote, or a deploy that predates the variable all read as "set" in a
 * dashboard and mint nothing.
 *
 * READING THE CONFIG cannot answer it, and neither can looking at the site. The
 * token is a pure function of the secret and an order id, and it surfaces in
 * exactly two places: the confirmation EMAIL, and the verify path, which
 * behaves identically for a missing secret and a wrong token. So there is no
 * signal to read from outside, which is precisely why this had never been
 * confirmed.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES INSTEAD. It asks the deployment to mint one and verify it.
 *
 * The health sentinel now carries an `order_access` check that mints a token
 * for a fixed non-existent probe order, verifies it against that order, and
 * verifies that a token minted for a DIFFERENT order is refused. It is a real
 * round trip through the real module, not a config read, and it discloses
 * nothing: the probe ids are constants and the token never leaves the function.
 *
 * `?dry=1` runs the battery and sends no email, so this is a read-only probe of
 * production that cannot wake anybody.
 *
 * NEEDS: CRON_SECRET for the target deployment, and a deploy that INCLUDES the
 * order_access check. If the check is absent from the response, this says the
 * deployment predates it rather than guessing.
 *
 * Usage:
 *   CRON_SECRET=... node scripts/verify/guest-links-live.mjs https://www.eventlinqs.com.au
 */
const BASE = (process.argv[2] ?? process.env.BASE ?? '').replace(/\/$/, '')
const SECRET = process.env.CRON_SECRET ?? ''

if (!BASE) {
  console.error('usage: CRON_SECRET=... node scripts/verify/guest-links-live.mjs <https://host>')
  process.exit(2)
}
if (!SECRET) {
  console.error('CRON_SECRET is not set. It is the only way to reach the sentinel, and it is never printed by this script.')
  process.exit(2)
}

const url = `${BASE}/api/cron/health-sentinel?dry=1`
console.log(`[guest-links] asking ${BASE} to mint and verify a probe link (no email will be sent)`)

let res
try {
  res = await fetch(url, { headers: { authorization: `Bearer ${SECRET}` } })
} catch (err) {
  console.error(`[guest-links] could not reach the sentinel: ${String(err).slice(0, 140)}`)
  process.exit(1)
}

if (res.status === 401 || res.status === 403) {
  console.error(`[guest-links] the sentinel refused the credential (HTTP ${res.status}). CRON_SECRET does not match this deployment.`)
  process.exit(1)
}

const body = await res.json().catch(() => null)
if (!body?.checks) {
  console.error(`[guest-links] HTTP ${res.status} with no check battery in the body. Not a sentinel response.`)
  process.exit(1)
}

const check = body.checks.find(c => c.id === 'order_access')

if (!check) {
  console.error(
    '[guest-links] UNKNOWN. This deployment has no order_access check, which means it predates it.\n' +
      '              Deploy the commit that adds it, then run this again. Do NOT read this as a pass:\n' +
      '              the absence of the check is the absence of an answer.',
  )
  process.exit(1)
}

console.log(`\n  ${check.ok ? 'ISSUING' : 'NOT ISSUING'}  ${check.label}`)
console.log(`      ${check.detail}`)
if (!check.ok) {
  if (check.probableCause) console.log(`      cause: ${check.probableCause}`)
  if (check.action) console.log(`      fix:   ${check.action}`)
}

console.log(
  check.ok
    ? '\n[guest-links] CONFIRMED: this deployment mints a guest order link and honours it, and refuses one minted for another order.'
    : '\n[guest-links] NOT CONFIRMED: a guest buyer on this deployment cannot reach their own order.',
)
process.exit(check.ok ? 0 : 1)
