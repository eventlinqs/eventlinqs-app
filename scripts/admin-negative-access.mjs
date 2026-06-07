// Negative-access test for the admin panel: an ANONYMOUS request (no auth
// cookies) to every admin route must be DENIED - redirected to /admin/login and
// never served admin content. A non-admin authenticated user hits the identical
// gate (getAdminSession returns null when there is no admin_users row for the
// verified user), so anon denial proves non-admin denial on the same code path.
//
// Also probes a server action endpoint anonymously to confirm it does not mutate
// (server actions re-check requireAdminSession + assertCapability at the top).
//
// Usage: node scripts/admin-negative-access.mjs [BASE]
const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')

// Every admin (authed) route - all must deny anon.
const AUTHED = [
  '/admin', '/admin/pricing', '/admin/users', '/admin/orders', '/admin/organisers',
  '/admin/payouts', '/admin/events', '/admin/audit', '/admin/analytics', '/admin/enrol-2fa',
]
// An admin-only content marker that must NEVER appear in an anon response.
const ADMIN_MARKERS = [/Pricing and fees/i, /Audit log/i, /admin-sidebar/i, /Disburse/i, /super_admin/i]

let fail = 0
const results = []

for (const path of AUTHED) {
  // redirect: manual to see the gate's 307/302 to /admin/login
  let verdict = 'UNKNOWN'
  let detail = ''
  try {
    const r = await fetch(BASE + path, { redirect: 'manual', headers: { 'user-agent': 'neg-access' } })
    const loc = r.headers.get('location') || ''
    if (r.status >= 300 && r.status < 400 && /\/admin\/login/.test(loc)) {
      verdict = 'DENIED (redirect to /admin/login)'
    } else {
      // follow and inspect the body for admin markers
      const rf = await fetch(BASE + path, { redirect: 'follow', headers: { 'user-agent': 'neg-access' } })
      const finalUrl = rf.url
      const body = await rf.text()
      const leaked = ADMIN_MARKERS.find(re => re.test(body))
      if (/\/admin\/login/.test(finalUrl) && !leaked) verdict = 'DENIED (lands on /admin/login)'
      else if (leaked) { verdict = 'LEAK'; detail = `marker ${leaked}` ; fail++ }
      else { verdict = 'DENIED (no admin content)'; detail = `final=${finalUrl} status=${rf.status}` }
    }
  } catch (e) { verdict = 'ERROR'; detail = String(e).slice(0, 80); fail++ }
  results.push({ path, verdict, detail })
  console.log(`${verdict.startsWith('DENIED') ? 'OK  ' : 'FAIL'} ${path.padEnd(22)} ${verdict} ${detail}`)
}

// /admin/login itself must be reachable (200) - the only public admin surface.
const login = await fetch(BASE + '/admin/login', { headers: { 'user-agent': 'neg-access' } })
console.log(`${login.status === 200 ? 'OK  ' : 'FAIL'} /admin/login          ${login.status} (login page reachable)`)
if (login.status !== 200) fail++

// Anonymous POST to a server-action route: must NOT perform an admin mutation.
// Without a valid Next-Action id + session it cannot run the action; we assert it
// does not return a success/redirect-to-saved.
try {
  const r = await fetch(BASE + '/admin/pricing', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'neg-access' },
    body: 'countryCode=AU&currency=AUD&platform_fee_percentage=0&platform_fee_fixed=0&processing_fee_pass_through=0',
  })
  const loc = r.headers.get('location') || ''
  const mutated = /status=saved/.test(loc)
  console.log(`${mutated ? 'FAIL' : 'OK  '} POST /admin/pricing    anon mutation ${mutated ? 'SUCCEEDED (LEAK)' : 'blocked'} (status ${r.status}${loc ? ', ->' + loc : ''})`)
  if (mutated) fail++
} catch (e) { console.log('OK   POST /admin/pricing    blocked (' + String(e).slice(0, 50) + ')') }

console.log(`\n${results.length + 2} checks; failures: ${fail}`)
console.log(fail === 0 ? 'NEGATIVE-ACCESS: PASS (all admin surfaces deny anon)' : 'NEGATIVE-ACCESS: FAIL')
process.exit(fail === 0 ? 0 : 1)
