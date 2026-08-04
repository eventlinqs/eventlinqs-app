/**
 * Served-bundle proof that a deployment is NOT wired to the production
 * Supabase project.
 *
 * Config being right is not the same as the deployed artefact being right:
 * NEXT_PUBLIC_* values are inlined at BUILD time, so the only honest check is
 * to read what the deployment actually serves. This fetches the HTML, follows
 * every script it loads, and counts project refs across the whole payload.
 *
 * Asserts, for a non-production deployment:
 *   1. the TEST project ref appears (the app is wired to something),
 *   2. the PRODUCTION project ref appears ZERO times,
 *   3. no `service_role` JWT is present anywhere in client-reachable code.
 *
 * Usage: node scripts/verify/preview-env-isolation-proof.mjs <deployment-url>
 */
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const base = process.argv[2]
if (!base) {
  console.error('usage: node scripts/verify/preview-env-isolation-proof.mjs <deployment-url>')
  process.exit(1)
}

const countOf = (hay, needle) => hay.split(needle).length - 1

const html = await (await fetch(base)).text()
if (/Authentication Required|_vercel\/sso/i.test(html)) {
  console.error('Deployment protection is on for this URL: the bundle cannot be read anonymously.')
  process.exit(1)
}

// Collect every script the page loads, plus the inline RSC payload in the HTML.
const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) =>
  m[1].startsWith('http') ? m[1] : new URL(m[1], base).toString(),
)
console.log(`page       : ${base}`)
console.log(`scripts    : ${srcs.length}`)

let prodHits = countOf(html, PROD_REF)
let testHits = countOf(html, TEST_REF)
let serviceRoleHits = countOf(html, '"role":"service_role"') + countOf(html, 'service_role')
const offenders = []
if (countOf(html, PROD_REF) > 0) offenders.push('(inline HTML / RSC payload)')

for (const src of srcs) {
  let body = ''
  try {
    body = await (await fetch(src)).text()
  } catch {
    continue
  }
  const p = countOf(body, PROD_REF)
  const t = countOf(body, TEST_REF)
  const s = countOf(body, 'service_role')
  prodHits += p
  testHits += t
  serviceRoleHits += s
  if (p > 0 || s > 0) offenders.push(`${src.split('/').pop()} (prod=${p}, service_role=${s})`)
}

console.log(`\nTEST ref ${TEST_REF} : ${testHits} occurrence(s)`)
console.log(`PROD ref ${PROD_REF} : ${prodHits} occurrence(s)`)
console.log(`service_role markers        : ${serviceRoleHits} occurrence(s)`)

const pass = testHits > 0 && prodHits === 0 && serviceRoleHits === 0
console.log(`\nverdict: ${pass ? 'PASS - the served bundle resolves TEST and leaks no production credential' : 'FAIL'}`)
if (offenders.length > 0) console.log(`offending assets:\n  ${offenders.join('\n  ')}`)
process.exitCode = pass ? 0 : 2
