/**
 * GUARD: EVERY MATCHED PERSON IS STILL CONSENTED, AND NO RUN EXCEEDS ITS CAP.
 *
 * Close-out GA2. The matcher produces the list a campaign will one day send
 * against, so two things about that list have to be true and neither can be
 * left to the code that wrote it.
 *
 *   1. NOBODY IN A STORED RUN IS SOMEBODY THE RESOLVER REFUSES. A ranked list
 *      is only worth what its consent is worth, and a list that quietly keeps a
 *      person who withdrew is the exact failure GA1 spent a migration making
 *      impossible at the point of capture. The trigger on
 *      marketing_match_score refuses one arriving; this asks whether one is
 *      THERE, which is a different question: a trigger dropped, disabled or
 *      added after the fact leaves rows behind it, and the trigger's existence
 *      says nothing about the rows already in the table.
 *   2. NO RUN HOLDS MORE SCORE ROWS THAN THE CAP RECORDED ON IT. The cap is the
 *      owner's answer to "how many people am I about to contact", and a run
 *      that quietly holds more than it says is a spend nobody approved.
 *
 * WHAT IT READS. public.marketing_match_invariant_breaches, one view that
 * defines both clauses in SQL, so this guard and a person reading the database
 * are reading the same definition rather than two descriptions of it. It also
 * reads the migrations, so the two structural halves (the trigger and the view)
 * cannot be deleted without this failing even when the data happens to be
 * clean.
 *
 * SKIP OR FAIL, and the distinction is narrow and deliberate, copied from
 * scripts/guards/curated-categories-exist.mjs: CI's typecheck build carries
 * PLACEHOLDER Supabase values and has no database behind it on purpose, so this
 * SKIPS there, loudly, naming why. With a real project URL it CHECKS, and an
 * unreachable database FAILS, because "could not look" reported as a pass is
 * the shape this repository has spent weeks removing.
 *
 * Run standalone:  node --env-file=.env.local scripts/guards/matcher-consented-and-capped.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[matcher-consented-and-capped]'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/* ---------------------------------------------------------- the structural half */

function allMigrationSql() {
  if (!existsSync(MIGRATIONS)) return { sql: '', files: 0 }
  const names = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  let sql = ''
  for (const n of names) sql += readFileSync(join(MIGRATIONS, n), 'utf8') + '\n'
  return { sql: sql.replace(/\s+/g, ' ').toLowerCase(), files: names.length }
}

const structural = []
const { sql, files } = allMigrationSql()

if (!sql.includes('before insert on public.marketing_match_score for each row execute function public.match_score_requires_live_consent()')) {
  structural.push(
    'no migration puts the consent-and-cap trigger on public.marketing_match_score. Without it a score row for a refused person is written and only found afterwards.',
  )
}
if (!sql.includes('create or replace view public.marketing_match_invariant_breaches')) {
  structural.push(
    'public.marketing_match_invariant_breaches is not defined by any migration, so this guard has nothing to read and the invariant is stated nowhere in SQL.',
  )
}

/* ------------------------------------------------------------- the data half */

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(join(ROOT, '.env.test'))) {
  for (const line of readFileSync(join(ROOT, '.env.test'), 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/
const hasRealProject = typeof url === 'string' && REAL_PROJECT.test(url.trim())

function report(checkedRows, breaches) {
  declareWork('matcher-consented-and-capped', {
    did: {
      'migration read': files,
      'structural half checked': 2,
      'score row judged': checkedRows,
    },
    found: { 'matcher invariant breach': breaches.length + structural.length },
    zeroIsFine: {
      /*
       * A platform that has produced no match run yet has no score rows, and
       * that is the true state rather than a check that failed to look. The
       * structural half above is counted separately and is never zero, so this
       * guard can still only pass by doing something.
       */
      'score row judged':
        'no matcher run has been produced yet, so there are no score rows to judge. The structural half still ran.',
    },
  })
}

if (structural.length > 0) {
  report(0, [])
  for (const problem of structural) console.error(`${TAG} FAIL: ${problem}`)
  process.exit(1)
}

if (url && !hasRealProject) {
  report(0, [])
  console.log(`${TAG} the trigger and the view are both defined by the migrations`)
  console.log('')
  console.log(`SKIP: NEXT_PUBLIC_SUPABASE_URL is not a real Supabase project URL`)
  console.log(`      (${url.length} characters), so there are no matcher rows to judge.`)
  console.log('      This is the CI typecheck build, which uses placeholders by design.')
  process.exit(0)
}

if (!url || !key) {
  report(0, [])
  console.error('')
  console.error(`${TAG} FAIL: no Supabase URL or key in the environment, so the stored matcher`)
  console.error('      runs could not be checked. A check that cannot look is not a check that')
  console.error('      passed.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: breaches, error } = await db
  .from('marketing_match_invariant_breaches')
  .select('breach, run_id, audience_member_id, detail')

if (error) {
  report(0, [])
  console.error(`${TAG} FAIL: could not read marketing_match_invariant_breaches: ${error.message}`)
  process.exit(1)
}

const { count: scoreRows } = await db
  .from('marketing_match_score')
  .select('id', { count: 'exact', head: true })

report(scoreRows ?? 0, breaches ?? [])

console.log(
  `${TAG} the trigger and the view are both defined by the migrations; ${scoreRows ?? 0} stored score row(s) judged`,
)

if ((breaches ?? []).length > 0) {
  for (const row of breaches) console.error(`${TAG} FAIL: ${row.breach}: ${row.detail}`)
  console.error(`${TAG} ${breaches.length} breach(es) of the matcher invariant.`)
  process.exit(1)
}

console.log(`${TAG} OK`)
