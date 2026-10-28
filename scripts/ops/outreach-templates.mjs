/**
 * THE ORGANISER MESSAGES AS TEMPLATE ROWS (window 6, 28 October 2026).
 *
 * Reads scripts/ops/data/outreach-templates-28oct.json (the project manager's final texts,
 * C:\dev\START-16OCT\EVENTLINQS-ORGANISER-MESSAGES-28OCT.md) and writes each as version 1 of its key in
 * public.outreach_templates, skipping a key and version already there. A row is never edited: a changed text is the
 * next version, written by a later run of this script with --version.
 *
 *   node scripts/ops/outreach-templates.mjs --by <auth user uuid> [--into <dir>]  writes the SQL, runs nothing
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/outreach-templates.mjs --by <uuid> --test
 *                                                                                 runs it on TEST (the only ref it will run on)
 *
 * PRODUCTION (operating rule 4): the written file is a dry run that ends in ROLLBACK. Lawal changes ROLLBACK to COMMIT
 * by typing APPLY in the run that applies it, and the write is logged in C:\dev\PRODUCTION-WRITES.txt. This script never
 * connects to production.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if (TEST_REF === PRODUCTION_REF) throw new Error('outreach-templates runs on TEST only')

const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
const by = arg('--by')
const version = Number(arg('--version') ?? '1')
if (!by || !/^[0-9a-f-]{36}$/i.test(by)) {
  console.error('usage: node scripts/ops/outreach-templates.mjs --by <auth user uuid> [--version N] [--test]')
  process.exit(2)
}

const data = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/data/outreach-templates-28oct.json'), 'utf8'))
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const rows = data.templates.map(
  (t) =>
    `(${q(t.key)}, ${version}, ${q(t.channel)}, ${q(t.purpose)}, ${t.step ?? 'null'}, ${q(t.subject)}, ${q(t.body)}, ${q(`${data.source}, message ${t.message}`)}, ${q(by)})`,
)
const insert = `insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by) values\n${rows.join(',\n')}\non conflict (key, version) do nothing`

const dryRun = `-- ${data.templates.length} organiser message templates, version ${version}. Dry run: ends in ROLLBACK.\nbegin;\n${insert};\nselect key, version, channel, purpose, step from public.outreach_templates where version = ${version} order by key;\nrollback;\n`
const out = join(arg('--into') ?? tmpdir(), `outreach-templates-v${version}-DRY-RUN.sql`)
writeFileSync(out, dryRun)
console.log(`wrote ${out} (${data.templates.length} templates, version ${version}, ends in ROLLBACK)`)

if (args.includes('--test')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('--test needs SUPABASE_ACCESS_TOKEN (scripts\\ops\\with-supabase-token.ps1)')
  const query = `${insert} returning key;`
  const r = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await r.text()
  if (!r.ok) {
    console.error(`TEST refused (HTTP ${r.status}): ${body.slice(0, 600)}`)
    process.exit(1)
  }
  const written = JSON.parse(body)
  console.log(`TEST (${TEST_REF}): ${written.length} written, ${data.templates.length - written.length} already there`)
  const check = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: `select count(*)::int as n from public.outreach_templates where version = ${version}` }),
  })
  console.log(`TEST read back: ${(await check.json())[0].n} template rows at version ${version}`)
}
