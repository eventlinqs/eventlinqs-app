/**
 * THE SAME DRIVE, WITH THE DEFECT PUT BACK.
 *
 * A green drive proves the platform works today. It does not prove the drive
 * would have noticed the thing it was written for, and a proof that cannot fail
 * is not a proof. This puts BOTH halves of LB-READFAIL back into
 * `src/lib/campaigner/run.ts` and requires the named checks to fail:
 *
 *   1. the token read chunks by COUNT again, a hundred at a time, so seventy
 *      addresses of 254 characters go into one 17.8 KB request;
 *   2. the error is DISCARDED again, so the failure becomes
 *      "this address has no consent record carrying an unsubscribe token",
 *      written into the append-only marketing_send_skip and counted onto
 *      /admin/campaigns, about seventy people whose consent says granted.
 *
 * THE TWO HALVES ARE RESTORED BOTH TOGETHER, from a byte snapshot taken before
 * anything is touched, and the restore is verified with Buffer.compare rather
 * than assumed. The harness that this pattern came from has been killed
 * mid-drill twice, so the snapshot is taken first and the comparison is the
 * thing that decides whether the tree is clean, never the fact that a `finally`
 * block ran.
 *
 * Run (dev server on 3100 against TEST):
 *   node scripts/verify/lb-readfail-drive-red.mjs --out C:/dev/EVIDENCE/LB-READFAIL/red
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'


const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const RUN = 'src/lib/campaigner/run.ts'

const FIXED = `  const tokens = new Map<string, string>()
  const emails = [...members.values()].map(m => m.email)
  for (const chunk of chunkInFilterValues(emails)) {
    const rows = await readOrThrow('campaigner unsubscribe tokens', () =>
      admin
        .from('marketing_consents')
        .select('email, unsubscribe_token')
        .in('email', chunk)
        // One row per address: marketing_consents is unique (email).
        .limit(chunk.length),
    )
    for (const row of rows ?? []) tokens.set(row.email.toLowerCase(), row.unsubscribe_token)
  }`

const BROKEN = `  const tokens = new Map<string, string>()
  const emails = [...members.values()].map(m => m.email)
  for (let i = 0; i < emails.length; i += 100) {
    const { data } = await admin
      .from('marketing_consents')
      .select('email, unsubscribe_token')
      .in('email', emails.slice(i, i + 100))
      .limit(100)
    for (const row of data ?? []) tokens.set(row.email.toLowerCase(), row.unsubscribe_token)
  }`

const asLf = (s) => s.replace(/\r\n/g, '\n')

const before = readFileSync(RUN)
const text = asLf(before.toString('utf8'))
if (!text.includes(FIXED)) {
  console.error(`FAIL: the anchor is no longer in ${RUN}. This red drive is stale and proves nothing.`)
  process.exit(1)
}

console.log('=== LB-READFAIL: the drive, with the defect put back ===\n')
console.log(`  planting the count bound and the discarded error in ${RUN}`)

let exitCode = 1
try {
  writeFileSync(RUN, text.replace(FIXED, BROKEN))
  try {
    execFileSync(
      process.execPath,
      [
        '--import', './scripts/lib/server-only-shim.mjs',
        '--import', './scripts/lib/src-alias-loader.mjs',
        '--env-file=.env.local',
        'scripts/verify/lb-readfail-drive.mjs',
        '--out', out,
        '--expect-red',
      ],
      { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined } },
    )
    exitCode = 0
  } catch {
    exitCode = 1
  }
} finally {
  writeFileSync(RUN, before)
  const restored = Buffer.compare(before, readFileSync(RUN)) === 0
  console.log('')
  console.log(`  restore: ${restored ? `${RUN} is byte-identical to where it started` : 'RESTORE FAILED, the tree must be checked by hand'}`)
  if (!restored) process.exit(1)
}

console.log('')
if (exitCode === 0) {
  console.log('The named checks failed with the defect in place, so the drive can see what it was written for.')
} else {
  console.error('PROBLEM: the drive did NOT fail with the defect in place. It is not proving what it claims.')
}
process.exit(exitCode)
