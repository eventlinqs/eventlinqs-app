/**
 * RUN ONE PROOF FILE ON TEST, ROLLED BACK (window 2, 27 October 2026). For a proof that adds no table, which
 * replay-under-new-default.mjs (it counts the migration's tables first) does not take. The proof is a DO block that
 * ends by raising its verdict, so the transaction rolls back and TEST is left exactly as found.
 *
 *   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <proof.sql>
 *
 * TEST ONLY: the project ref is a constant, and the production ref is refused whatever it is edited to. The token
 * comes from the environment and is never printed.
 */
import { readFileSync } from 'node:fs'

const REF = 'vkapkibzokmfaxqogypq'
if (REF === 'gndnldyfudbytbboxesk') throw new Error('run-proof-on-test runs on TEST only, never on production')
const file = process.argv[2]
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!file || !token) {
  console.error('usage: scripts\\ops\\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <proof.sql>')
  process.exit(2)
}
const query = readFileSync(file, 'utf8')
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
const body = await r.text()
const verdict = body.match(/PROOF (PASSED|FAILED)[^"\\]*/)
if (!verdict) {
  console.error(`no verdict (HTTP ${r.status}): ${body.slice(0, 600)}`)
  process.exitCode = 1
} else {
  console.log(`target TEST (${REF}), rolled back: the proof raised its verdict`)
  console.log(verdict[0].split(' | ').join('\n  '))
  process.exitCode = verdict[1] === 'PASSED' ? 0 : 1
}
