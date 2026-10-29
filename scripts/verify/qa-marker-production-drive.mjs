/**
 * R3 ON A DEPLOYMENT: A MARKED PRESS ON THE LIVE HOPS, READ BACK AS A TEST (the master mandate of 29 October 2026,
 * sections 10, 13 and 16; the project manager's 21:42 R3; 20261029220001).
 *
 * The secret is made here, held in this process's memory only, and never printed, logged or written: only its sha256
 * leaves, to the evidence file and the console, for WINDOW 4 to write as one qa_markers row through its logged apply.
 * This process then waits (reading the database only, through the Management API with read_only) until that row
 * exists, presses the hops named with the secret in the x-eventlinqs-qa header, and reads every row they wrote back:
 * each must carry is_test true, and no row without it may appear for those links in the same minutes. When it ends the
 * secret is gone with it; the marker expires on its own.
 *
 *   scripts\ops\with-supabase-token.ps1 node scripts/verify/qa-marker-production-drive.mjs
 *       --site https://www.eventlinqs.com.au --ref gndnldyfudbytbboxesk
 *       --s <share code> [--e <share or readable code>] [--go <piece id>] --label w5-production [--wait-minutes 90]
 *
 * A rehearsal on TEST (a preview deployment on TEST, --ref vkapkibzokmfaxqogypq) may add --plant-marker-on-test, which
 * writes the marker itself as postgres and removes it after; that flag is refused for any other project.
 *
 * It never presses /out (window 2's half) and never sends anything but GET. The last line is the verdict.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const args = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const site = (arg('--site') ?? '').replace(/\/$/, '')
const ref = arg('--ref') ?? ''
const sCode = arg('--s')
const eCode = arg('--e')
const goPiece = arg('--go')
const label = arg('--label') ?? 'w5'
const waitMinutes = Number(arg('--wait-minutes') ?? '90')
const plant = args.includes('--plant-marker-on-test')
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
const OUT = join('C:', 'dev', 'EVIDENCE', 'ENGINE-H-29OCT', 'qa-marker-production')

if (!/^https:\/\//.test(site) || !/^[a-z]{20}$/.test(ref) || (!sCode && !eCode && !goPiece)) {
  console.error('usage: --site https://... --ref <project ref> --s <code> [--e <code>] [--go <piece>] [--label x]')
  process.exit(2)
}
if (!token) {
  console.error('run through scripts\\ops\\with-supabase-token.ps1: the read back goes through the Management API')
  process.exit(2)
}
if (plant && ref !== TEST_REF) {
  console.error('--plant-marker-on-test is for TEST only; on production WINDOW 4 writes the marker through its logged apply')
  process.exit(2)
}

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
}

async function sql(query, { write = false } = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(write ? { query } : { query, read_only: true }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`management query ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}
const quote = (v) => `'${String(v).replace(/'/g, "''")}'`

const secret = randomBytes(32).toString('hex')
const sha = createHash('sha256').update(secret, 'utf8').digest('hex')
mkdirSync(OUT, { recursive: true })
const shaFile = join(OUT, `marker-sha256-${label}.txt`)
writeFileSync(
  shaFile,
  `label ${label}\nproject ${ref}\nsha256 ${sha}\nwritten ${new Date().toISOString()}\nthe secret is held only by the process that wrote this line and is never stored\n`,
)
console.log(`MARKER sha256 ${sha} (label ${label}, project ${ref}); written to ${shaFile}`)

try {
  if (plant) {
    await sql(`insert into public.qa_markers (sha256, label, expires_at, created_by) values (${quote(sha)}, ${quote(`rehearsal ${label}`)}, now() + interval '2 hours', 'window 5 rehearsal')`, { write: true })
  }

  // Wait for the marker row, reading only.
  const deadline = Date.now() + waitMinutes * 60 * 1000
  let present = false
  while (Date.now() < deadline) {
    const rows = await sql(`select count(*)::int as n from public.qa_markers where sha256 = ${quote(sha)} and expires_at > now()`)
    if (rows[0]?.n === 1) {
      present = true
      break
    }
    await new Promise((r) => setTimeout(r, 30_000))
  }
  check('the marker row for this secret exists and has not expired', present)
  if (!present) throw new Error('no marker row by the deadline; nothing was pressed')

  const [{ now: started }] = await sql('select now()::text as now')
  const links = (await sql(`select id, code from public.share_links where code in (${[sCode, eCode].filter(Boolean).map(quote).join(', ') || "''"})`))
  const linkIds = links.map((l) => l.id)

  const press = async (path) => {
    const res = await fetch(`${site}${path}`, {
      redirect: 'manual',
      headers: { 'x-eventlinqs-qa': secret, 'user-agent': 'EventLinqs-QA crawler (window 5, R3 marked press)' },
    })
    return res.status
  }
  if (sCode) check(`/s/${sCode} answers a redirect`, [301, 302, 307, 308].includes(await press(`/s/${sCode}`)))
  if (eCode) {
    const status = await press(`/e/${eCode}`)
    check(`/e/${eCode} answers`, status === 200 || (status >= 300 && status < 400), { status })
  }
  if (goPiece) check(`/go/${goPiece} answers a redirect`, (await press(`/go/${goPiece}`)) === 302)

  // Give the writes a moment, then read every row they made.
  await new Promise((r) => setTimeout(r, 5_000))
  if (linkIds.length > 0) {
    const rows = await sql(
      `select kind, is_test from public.share_link_events where link_id in (${linkIds.map(quote).join(', ')}) and occurred_at >= ${quote(started)}::timestamptz order by occurred_at`,
    )
    const expected = (sCode ? 1 : 0) + (eCode ? 1 : 0)
    check('each share press was written, and as a test', rows.filter((r) => r.is_test === true).length === expected, rows)
    check('no press on those links was written as a person in these minutes', rows.every((r) => r.is_test === true), rows)
  }
  if (goPiece) {
    const rows = await sql(`select is_test from public.go_presses where piece_id = ${quote(goPiece)} and pressed_at >= ${quote(started)}::timestamptz`)
    check('the /go press was written, and as a test', rows.length === 1 && rows[0].is_test === true, rows)
  }
} catch (err) {
  check('the drive ran to its end', false, err instanceof Error ? err.message : String(err))
} finally {
  if (plant) {
    try {
      await sql(`delete from public.share_link_events where is_test and occurred_at >= now() - interval '3 hours' and link_id in (select id from public.share_links where code in (${[sCode, eCode].filter(Boolean).map(quote).join(', ') || "''"}))`, { write: true })
      await sql(`delete from public.qa_markers where sha256 = ${quote(sha)}`, { write: true })
      console.log('rehearsal: the marker and the test rows it made removed')
    } catch (err) {
      check('the rehearsal cleaned up', false, err instanceof Error ? err.message : String(err))
    }
  }
}

console.log(failures === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${failures} check(s)`)
process.exit(failures === 0 ? 0 : 1)
