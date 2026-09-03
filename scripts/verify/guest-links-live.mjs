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
const argv = process.argv.slice(2)
const shaFlag = argv.indexOf('--deployed-sha')
const DEPLOYED_SHA = shaFlag === -1 ? '' : argv[shaFlag + 1]
const BASE = (argv.find(a => a.startsWith('http')) ?? process.env.BASE ?? '').replace(/\/$/, '')
const SECRET = process.env.CRON_SECRET ?? ''

/*
 * THE CHEAPER QUESTION, ASKED FIRST, added 29 August 2026.
 *
 * On 29 August the founder set ORDER_ACCESS_SECRET on Vercel production and
 * asked whether guest links were being issued. The sentinel probe below is the
 * right way to answer that, and it could not run: it needs the production
 * CRON_SECRET, and it needs a deployment that CARRIES the order_access check.
 *
 * The real situation turned out to be simpler and worse than either. The
 * deployed commit did not contain src/lib/orders/order-access.ts AT ALL. The
 * whole guest magic link, the thing the secret exists for, was not on
 * production. So the secret was set correctly and read by nothing, and the
 * answer to "are links being issued" was no, for a reason no amount of
 * checking the variable could ever have surfaced.
 *
 * A deployed commit is a fact anyone can check against git in a second, without
 * a credential and without touching production, so this asks that first:
 *
 *   node scripts/verify/guest-links-live.mjs --deployed-sha 9cf7d36
 *
 * It answers from the ARTEFACT that was deployed, not from configuration, which
 * is what was asked for. A variable is a promise; a commit is what actually
 * shipped.
 */
if (DEPLOYED_SHA) {
  const { execFileSync } = await import('node:child_process')
  // Every git spawn in this repository carries a cleared environment. Inside a
  // hook, git exports GIT_DIR, and a child that inherits it operates on THAT
  // repository no matter what cwd says. scripts/guards/no-inherited-git-env.mjs
  // enforces it, and it caught these three call sites on the first push.
  const { gitEnv } = await import('../lib/git-env.mjs')
  const FEATURE_FILES = [
    ['src/lib/orders/order-access.ts', 'mints and verifies the guest order token'],
    ['src/lib/email/order-confirmation.ts', 'puts the link in the buyer confirmation email'],
  ]
  console.log(`[guest-links] checking what commit ${DEPLOYED_SHA} actually contains\n`)
  let missing = 0
  for (const [file, why] of FEATURE_FILES) {
    let present = false
    try {
      execFileSync('git', ['cat-file', '-e', `${DEPLOYED_SHA}:${file}`], { stdio: 'ignore', env: gitEnv() })
      present = true
    } catch {
      present = false
    }
    if (!present) missing += 1
    console.log(`  ${present ? 'PRESENT' : 'ABSENT '}  ${file}\n            ${why}`)
  }
  let hasCheck = false
  try {
    const checks = execFileSync('git', ['show', `${DEPLOYED_SHA}:src/lib/health/checks.ts`], { encoding: 'utf8', env: gitEnv() })
    hasCheck = checks.includes('order_access')
  } catch {
    hasCheck = false
  }
  console.log(`  ${hasCheck ? 'PRESENT' : 'ABSENT '}  the order_access health check\n            the only way to ask a running deployment to prove it`)

  if (missing > 0) {
    console.error(
      `\n[guest-links] NOT ISSUING, and no credential was needed to establish it.\n` +
        `              ${missing} of ${FEATURE_FILES.length} file(s) the feature is made of are not in that commit,\n` +
        `              so nothing on that deployment reads ORDER_ACCESS_SECRET and no guest link is\n` +
        `              minted, put in an email, or honoured. Setting the variable was correct and is\n` +
        `              not the missing piece: the DEPLOY is. A guest buyer on that deployment cannot\n` +
        `              reach their own order to refund or transfer it.`,
    )
    process.exit(1)
  }
  if (!hasCheck) {
    console.error(
      `\n[guest-links] UNKNOWN from the artefact alone. The feature is in that commit, but the\n` +
        `              order_access health check is not, so the deployment cannot be asked to prove\n` +
        `              it mints one. Deploy the commit carrying the check, then run the live probe.`,
    )
    process.exit(1)
  }
  console.log('\n[guest-links] that commit carries the feature AND the check. Run the live probe to confirm the running deployment:')
  console.log(`              CRON_SECRET=... node scripts/verify/guest-links-live.mjs ${BASE || '<https://host>'}`)
  process.exit(0)
}

if (!BASE) {
  console.error('usage: CRON_SECRET=... node scripts/verify/guest-links-live.mjs <https://host>')
  console.error('   or: node scripts/verify/guest-links-live.mjs --deployed-sha <sha>   (no credential needed)')
  process.exit(2)
}
if (!SECRET) {
  console.error('CRON_SECRET is not set. It is the only way to reach the sentinel, and it is never printed by this script.')
  console.error('Without it, ask the cheaper question instead: --deployed-sha <sha>')
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
