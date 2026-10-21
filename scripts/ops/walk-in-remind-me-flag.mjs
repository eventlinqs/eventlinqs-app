// TURN REMIND ME ON FOR FREE WALK-IN EVENTS (WI1), ON ONE DATABASE.
//
// Lawal, 21 October 2026: "Remind me does not go live in production until he
// approves" the dated privacy version that names it. Migration 20261021000020
// seeds the switch OFF everywhere; this script is the only thing that turns it
// on in production, and it does so with APPLY typed by Lawal, never by a deploy.
//
// Usage (the token comes from the environment and is never printed):
//   scripts\ops\with-supabase-token.ps1 node scripts\ops\walk-in-remind-me-flag.mjs
//   ... --target test          TEST (vkapkibzokmfaxqogypq) instead of production
//   ... --apply                write; asks the operator to type APPLY first.
//                              Without it, a dry run that writes nothing.
// A production apply is logged in C:\dev\PRODUCTION-WRITES.txt (operating rule 4
// of 25 September 2026).
//
// IT REFUSES BEFORE IT ACTS:
//   - the switch row is missing (the migration has not been applied there);
//   - on production, the live privacy page does not yet carry the Remind me
//     wording (the approved version must be live before the capture is);
//   - the switch is already on (nothing to do, and it says so).
// It proves the result by reading the row back, never by trusting its update.

import { appendFileSync, readSync } from 'node:fs'

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const FLAG = 'walk_in_remind_me'
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const PRIVACY_URL = 'https://www.eventlinqs.com.au/legal/privacy'
// The sentence the approved version adds (docs/legal/privacy/PRIVACY-2026-10-24-DRAFT.md).
const PRIVACY_MARK = 'Reminder requests:'

const args = process.argv.slice(2)
let target = 'production'
let apply = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--apply') apply = true
  else if (args[i] === '--target') {
    const value = args[i + 1]
    i += 1
    if (value !== 'test') {
      console.error(`REFUSED: --target accepts only "test" (no flag means production); got ${JSON.stringify(value ?? null)}`)
      process.exit(2)
    }
    target = 'test'
  } else {
    console.error(`REFUSED: unknown argument ${JSON.stringify(args[i])}`)
    process.exit(2)
  }
}

const ref = TARGETS[target]
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('REFUSED: SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts\\ops\\with-supabase-token.ps1')
  process.exit(2)
}

async function query(sql, readOnly) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`query failed on ${target} (HTTP ${res.status}): ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

/** One synchronous read of the console, so nothing of ours is pending afterwards. */
function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(256)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    return ''
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

const READ = `select flag, enabled, updated_at from public.feature_flags where flag = '${FLAG}'`

async function main() {
  console.log(`target ${target} (${ref}), ${apply ? 'APPLY' : 'dry run'}`)
  const [row] = await query(READ, true)
  if (!row) {
    console.log(`REFUSE: there is no ${FLAG} row on ${target}; migration 20261021000020 has not been applied there`)
    return 1
  }
  console.log(`ON RECORD ${FLAG} enabled=${row.enabled} updated ${row.updated_at ?? '(never)'}`)
  if (row.enabled) {
    console.log(`NOTHING TO DO: ${FLAG} is already on, on ${target}`)
    return 0
  }

  if (target === 'production') {
    const res = await fetch(PRIVACY_URL, { headers: { 'cache-control': 'no-cache' } })
    const html = await res.text()
    if (!res.ok || !html.includes(PRIVACY_MARK)) {
      console.log(`REFUSE: ${PRIVACY_URL} (HTTP ${res.status}) does not carry the approved Remind me wording ("${PRIVACY_MARK}") yet`)
      return 1
    }
    console.log(`PRIVACY: ${PRIVACY_URL} carries the Remind me wording`)
  }

  if (!apply) {
    console.log(`WOULD SET ${FLAG} enabled=true on ${target}`)
    console.log('DRY RUN: 1 switch to turn on, 0 written')
    return 0
  }

  const typed = askLine(`Type APPLY to turn ${FLAG} on, on ${target} (${ref}): `)
  if (typed !== 'APPLY') {
    console.log('NOT APPLIED: the confirmation was not APPLY; nothing was written')
    return 1
  }

  await query(`update public.feature_flags set enabled = true, updated_at = now() where flag = '${FLAG}'`, false)
  const [after] = await query(READ, true)
  const ok = after?.enabled === true
  console.log(ok ? `APPLIED: ${FLAG} is on, on ${target}, read back from the database` : `FAILED: ${FLAG} still reads off`)
  if (ok && target === 'production') {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    appendFileSync(LOG, `${stamp}  founder typed APPLY: APPLIED: ${FLAG} enabled=true (WI1 Remind me, after the privacy version naming it went live)\n`)
    console.log(`LOGGED in ${LOG}`)
  }
  console.log('The flag cache holds a reading for up to 30 seconds (FEATURE_FLAG_CACHE_TTL_SECONDS), so pages show Remind me within half a minute.')
  return ok ? 0 : 1
}

// process.exitCode rather than process.exit after network work: exiting while a
// fetch socket is still closing aborts Node on Windows (nodejs/node#56645).
main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`FAILED: ${error.message}`)
    process.exitCode = 1
  },
)
