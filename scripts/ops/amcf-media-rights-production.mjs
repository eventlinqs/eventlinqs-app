/**
 * THE AMCF MEDIA-RIGHTS ROWS ON PRODUCTION (operating rule 4 of 25 September 2026: a production write is a script with a
 * dry run by default, applied only when the founder types APPLY, and logged in C:\dev\PRODUCTION-WRITES.txt).
 *
 * The same record as scripts/ops/amcf-media-rights.mjs, for the five AMCF photographs production already stores (the
 * event page's own files, scripts/ops/amcf-media-rights.manifest.json "production"). The rows go in PENDING: Lawal
 * approves each in /admin/social (J12); nothing here approves. Refused until 20261028205501 and 20261028212501 are on
 * production (car 3). Idempotent: a row already present is left.
 *
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/amcf-media-rights-production.mjs            the dry run: prints the SQL
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/amcf-media-rights-production.mjs --apply    asks for APPLY, writes, logs
 */
import { appendFileSync, readFileSync, readSync } from 'node:fs'

const REF = 'gndnldyfudbytbboxesk'
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const apply = process.argv.includes('--apply')
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('run through scripts\ops\with-supabase-token.ps1')
  process.exit(2)
}
const m = JSON.parse(readFileSync(new URL('./amcf-media-rights.manifest.json', import.meta.url), 'utf8'))
const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

async function query(sql, readOnly) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`query failed (HTTP ${res.status}): ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

async function main() {
  const [ready] = await query(
    "select (select count(*)::int from supabase_migrations.schema_migrations where version in ('20261028205501', '20261028212501')) as migrations, (select id from public.events where slug = 'amcf-2026') as event_id",
    true,
  )
  if (ready.migrations !== 2) {
    console.log(`REFUSED: production holds ${ready.migrations} of the two migrations this needs (20261028205501, 20261028212501); they ride car 3. Nothing written.`)
    return 1
  }
  if (!ready.event_id) {
    console.log('REFUSED: no amcf-2026 on production. Nothing written.')
    return 1
  }
  const rows = m.photos
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.production)
    .map(({ p, index }) => `(
    'organiser_authorised', 'photo', ${lit(ready.event_id)}, ${lit(p.production)}, ${lit(m.sourceUrl)}, ${lit(m.rightsHolder)}, ${lit(m.permissionEvidence)},
    ${lit(m.evidenceFile)}, ${lit(m.attribution)}, ${lit(m.scope)}, ${lit(m.archival)}, ${lit(m.expiresAt)}::timestamptz, ${lit(m.restrictions)},
    ${lit(`${p.file} (1100 x 733, the copy the AMCF event page stores; the organiser's originals are asked for)`)}, ${lit(m.receivedOn)}::date, ${lit(m.permittedUses)},
    ${p.focal[0]}, ${p.focal[1]}, 1100, 733, ${index + 1})`)
  const sql = `insert into public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, evidence_file,
    attribution_text, scope, archival, expires_at, restrictions, original_file, received_on, permitted_uses, focal_x, focal_y, source_width, source_height, lead_rank)
  values ${rows.join(',\n')}
  on conflict do nothing
  returning id, asset_url, approval_status;`
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on PRODUCTION (${REF}): ${rows.length} AMCF row(s), pending for Lawal's approval in /admin/social\n\n${sql}\n`)
  if (!apply) {
    console.log('DRY RUN: nothing written. Add --apply to be asked for APPLY.')
    return 0
  }
  process.stdout.write(`Type APPLY to write ${rows.length} AMCF media-rights rows (pending) to PRODUCTION: `)
  const buf = Buffer.alloc(64)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    n = 0
  }
  if (buf.subarray(0, n).toString('utf8').trim() !== 'APPLY') {
    console.log('NOT APPLIED: the confirmation was not APPLY; nothing was written')
    return 1
  }
  const made = await query(sql, false)
  const stamp = new Date().toISOString()
  appendFileSync(LOG, `${stamp}  founder typed APPLY: APPLIED: AMCF media-rights rows (scripts/ops/amcf-media-rights-production.mjs): ${made.length} new, pending for approval\n`)
  console.log(`APPLIED: ${made.length} new row(s), pending; logged in ${LOG}`)
  console.log(JSON.stringify(made, null, 1))
  return 0
}

process.exitCode = await main()
