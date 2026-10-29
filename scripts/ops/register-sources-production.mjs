/**
 * THE SOURCE REGISTER ON PRODUCTION (the engine plan's part A; the project manager's ruling of 16:28 on 29 October
 * 2026; operating rule 4: dry run by default, APPLY typed, logged in C:\dev\PRODUCTION-WRITES.txt).
 *
 * Production's listing_sources was empty, so the daily collection run read nothing there. This copies TEST's register
 * rows, every permission answer with its quote, address and date as the register's owner (window 3) recorded them,
 * under the ruling's condition, which is held here rather than trusted: a source goes in as 'read' only when its terms
 * AND every 'yes' that lets it be read were read TODAY; any other goes in as 'ask' and is named. TEST's run state
 * (last checked, last outcome, last success) and ids stay behind: production starts its own. A row that points at a
 * TEST organisation, venue or category is refused, since those ids mean nothing on production. Existing rows are left
 * (on conflict on page_url). Nothing publishes by itself: none of these is a partner's own feed.
 *
 *   node --env-file=.env.local scripts/ops/register-sources-production.mjs                       the plan, from TEST, nothing written
 *   scripts\ops\with-supabase-token.ps1 node --env-file=.env.local scripts/ops/register-sources-production.mjs --apply
 */
import { appendFileSync, readSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
// acquisition_order is generated from source_type (20261028140001:54) and production refuses a typed value, quoted
// 'cannot insert a non-DEFAULT value into column "acquisition_order"' (the first APPLY, 29 October 2026, nothing written).
const LEFT_BEHIND = new Set(['id', 'created_at', 'updated_at', 'last_checked_at', 'last_outcome', 'last_success_at', 'acquisition_order'])
const TEST_IDS = ['organisation_id', 'venue_id', 'category_id']
const READ_BY = ['may_scrape', 'may_subscribe', 'may_use_dataset']

const lit = (v) =>
  v === null || v === undefined ? 'null' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`

/** The rows production gets, which were demoted to ask and why, and which were refused. Pure. */
export function planRegister(testRows, today) {
  const rows = []
  const demoted = []
  const refused = []
  for (const src of testRows) {
    const tied = TEST_IDS.filter((k) => src[k])
    if (tied.length > 0) {
      refused.push(`${src.name}: names a TEST ${tied.join(' and ')}, which means nothing on production`)
      continue
    }
    const row = Object.fromEntries(Object.entries(src).filter(([k]) => !LEFT_BEHIND.has(k)))
    if (row.collection === 'read') {
      const why = []
      if (row.terms_read_on !== today) why.push(`terms read on ${row.terms_read_on ?? 'no date'}, not today`)
      for (const k of READ_BY) if (row[k] === 'yes' && row[`${k}_read_on`] !== today) why.push(`${k} yes read on ${row[`${k}_read_on`] ?? 'no date'}, not today`)
      if (why.length > 0) {
        row.collection = 'ask'
        demoted.push(`${row.name}: ${why.join('; ')}`)
      }
    }
    rows.push(row)
  }
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort()
  const sql =
    rows.length === 0
      ? ''
      : `insert into public.listing_sources (${cols.join(', ')})\nvalues\n${rows
          .map((r) => `  (${cols.map((c) => lit(r[c])).join(', ')})`)
          .join(',\n')}\non conflict (page_url) do nothing\nreturning name, collection;`
  return { rows, demoted, refused, sql }
}

function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(64)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    n = 0
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !url.includes(TEST_REF)) {
    console.error(`REFUSED: the register is read from TEST (${TEST_REF}); run with --env-file=.env.local and no production URL in the shell`)
    return 2
  }
  const { createClient } = await import('@supabase/supabase-js')
  const test = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await test.from('listing_sources').select('*').order('name').limit(200)
  if (error) {
    console.error(`REFUSED: TEST's register could not be read: ${error.message}`)
    return 1
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date())
  const plan = planRegister(data ?? [], today)
  const apply = process.argv.includes('--apply')
  console.log(`${apply ? 'APPLY' : 'PLAN'} for PRODUCTION (${PRODUCTION_REF}), today ${today} in Melbourne: ${plan.rows.length} source(s) from TEST, ${plan.rows.filter((r) => r.collection === 'read').length} read, ${plan.rows.filter((r) => r.collection !== 'read').length} ask`)
  for (const d of plan.demoted) console.log(`  DEMOTED to ask: ${d}`)
  for (const r of plan.refused) console.log(`  REFUSED: ${r}`)
  for (const r of plan.rows) console.log(`  ${r.collection.padEnd(4)} ${r.name}`)
  console.log(`\n${plan.sql}\n`)
  if (!apply) {
    console.log('PLAN: nothing written. Add --apply (through with-supabase-token.ps1) to be asked for APPLY.')
    return 0
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('REFUSED: --apply runs through scripts\\ops\\with-supabase-token.ps1')
    return 2
  }
  if (plan.rows.length === 0) {
    console.log('Nothing to write.')
    return 0
  }
  // Production's own generated columns, read before anything is written: a column the database computes is never typed.
  const gen = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'listing_sources' and is_generated = 'ALWAYS'",
      read_only: true,
    }),
  })
  if (!gen.ok) {
    console.log(`REFUSED: production's generated columns could not be read (HTTP ${gen.status}); nothing written`)
    return 1
  }
  const generated = (await gen.json()).map((r) => r.column_name)
  const typed = generated.filter((c) => plan.rows.some((r) => c in r))
  if (typed.length > 0) {
    console.log(`REFUSED: the plan types ${typed.join(', ')}, which production generates; nothing written`)
    return 1
  }
  if (askLine(`Type APPLY to register ${plan.rows.length} source(s) on PRODUCTION: `) !== 'APPLY') {
    console.log('NOT APPLIED: the confirmation was not APPLY; nothing was written')
    return 1
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: plan.sql, read_only: false }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.log(`REFUSED BY PRODUCTION (HTTP ${res.status}), nothing written: ${text.slice(0, 600)}`)
    return 1
  }
  const made = JSON.parse(text)
  appendFileSync(
    LOG,
    `${new Date().toISOString()}  APPLY typed: APPLIED: the source register on production (scripts/ops/register-sources-production.mjs, from TEST): ${made.length} new of ${plan.rows.length}; read ${plan.rows.filter((r) => r.collection === 'read').map((r) => r.name).join(', ') || 'none'}; demoted to ask ${plan.demoted.length}; under the project manager's ruling of 16:28, 29 October 2026\n`,
  )
  console.log(`APPLIED: ${made.length} new source(s); logged in ${LOG}`)
  console.log(JSON.stringify(made, null, 1))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main()
