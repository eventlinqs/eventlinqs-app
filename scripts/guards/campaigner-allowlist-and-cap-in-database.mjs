/**
 * GUARD: THE ALLOWLIST AND THE CAP ARE IN THE DATABASE, NOT IN A PROMPT.
 *
 * Close-out GA4. An autonomous sender produces exactly the two failures the
 * Spam Act is enforced on here: messages to people who did not consent or had
 * withdrawn, and volume nobody authorised. 34.8 million of the first cost the
 * Commonwealth Bank 7.5 million dollars in October 2024. A prompt can be argued
 * with. A check constraint cannot. So the rules live in SQL and this guard
 * asserts that they are still there AND that no row has slipped past them.
 *
 * THE INVARIANT, five clauses, all defined in one SQL view so this guard and a
 * person opening the database read one definition rather than two descriptions:
 *
 *   1. No send row whose recipient is not on the allowlist for that campaign
 *      AND that channel.
 *   2. No send row resting on an allowlist row whose consent state is not true.
 *   3. No SMS send resting on a consent scoped to email.
 *   4. No campaign and channel pair holding more send rows than its cap.
 *   5. No send out of draft without an approval for its own segment
 *      fingerprint.
 *
 * THE STRUCTURAL HALF matters as much as the data half, and more over time: the
 * data can be clean simply because nobody has sent anything yet. So the
 * composite foreign key, the two triggers and the allowlist check constraints
 * are all read out of the migrations, and losing any one of them fails the
 * build even on an empty table.
 *
 * SKIP OR FAIL: CI's typecheck build carries PLACEHOLDER Supabase values and
 * has no database behind it, so this SKIPS there, loudly, naming why. With a
 * real project URL it CHECKS, and an unreachable database FAILS, because "could
 * not look" reported as a pass is the shape this repository has spent weeks
 * removing.
 *
 * Run standalone:
 *   node --env-file=.env.local scripts/guards/campaigner-allowlist-and-cap-in-database.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[campaigner-allowlist-and-cap]'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

function allMigrationSql() {
  if (!existsSync(MIGRATIONS)) return { sql: '', files: 0 }
  const names = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  let sql = ''
  for (const n of names) sql += readFileSync(join(MIGRATIONS, n), 'utf8') + '\n'
  return { sql: sql.replace(/\s+/g, ' ').toLowerCase(), files: names.length }
}

const STRUCTURAL_CLAUSES = [
  {
    needle:
      'constraint marketing_send_recipient_is_allowlisted foreign key (allowlist_id, campaign_id, channel_code) references public.marketing_recipient_allowlist (id, campaign_id, channel_code)',
    problem:
      'no migration gives public.marketing_send the COMPOSITE foreign key onto the allowlist. Without it a send row can name an allowlist row from another campaign or another channel, and the reference that makes an unauthorised send impossible is gone.',
  },
  {
    needle: 'constraint marketing_recipient_allowlist_consent_must_be_true check (consent_state)',
    problem:
      'no migration refuses an allowlist row whose consent state is false. Without it the allowlist stops being a list of people who said yes.',
  },
  {
    needle:
      "constraint marketing_recipient_allowlist_scope_covers_channel check (consent_channel_scope = 'both' or consent_channel_scope = channel_code)",
    problem:
      'no migration refuses an allowlist row whose consent scope does not cover its own channel. Without it a consent to email admits somebody to an SMS list, which is the exact thing GA4 holds back behind its own consent.',
  },
  {
    needle:
      'before insert on public.marketing_send for each row execute function public.marketing_send_respects_cap()',
    problem:
      'no migration puts the volume cap trigger on public.marketing_send. Without it the cap becomes an application check, and an application check is what GA4 exists to not rely on.',
  },
  {
    needle:
      'before insert or update on public.marketing_send for each row execute function public.marketing_send_requires_approval()',
    problem:
      'no migration puts the approval trigger on public.marketing_send. Without it a machine-drafted message can move itself out of draft with nobody having read it.',
  },
  {
    needle: 'create or replace view public.marketing_send_invariant_breaches',
    problem:
      'public.marketing_send_invariant_breaches is not defined by any migration, so this guard has nothing to read and the invariant is stated nowhere in SQL.',
  },
]

const structural = []
const { sql, files } = allMigrationSql()
for (const clause of STRUCTURAL_CLAUSES) {
  if (!sql.includes(clause.needle)) structural.push(clause.problem)
}

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

function report(sendsJudged, breaches) {
  declareWork('campaigner-allowlist-and-cap-in-database', {
    did: {
      'migration read': files,
      'structural clause checked': STRUCTURAL_CLAUSES.length,
      'send row judged': sendsJudged,
    },
    found: { 'campaigner invariant breach': breaches + structural.length },
    zeroIsFine: {
      /*
       * A platform that has sent nothing has no send rows, and that is the true
       * state rather than a check that failed to look. The structural half is
       * counted separately and is never zero, so this guard can still only pass
       * by having done something.
       */
      'send row judged':
        'no campaign has drafted a message yet, so there are no send rows to judge. The structural half still ran.',
    },
  })
}

if (structural.length > 0) {
  report(0, 0)
  for (const problem of structural) console.error(`${TAG} FAIL: ${problem}`)
  process.exit(1)
}

if (url && !hasRealProject) {
  report(0, 0)
  console.log(`${TAG} the composite key, both triggers, both allowlist checks and the view are all defined by the migrations`)
  console.log('')
  console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL is not a real Supabase project URL')
  console.log(`      (${url.length} characters), so there are no send rows to judge.`)
  console.log('      This is the CI typecheck build, which uses placeholders by design.')
  process.exit(0)
}

if (!url || !key) {
  report(0, 0)
  console.error('')
  console.error(`${TAG} FAIL: no Supabase URL or key in the environment, so the stored sends`)
  console.error('      could not be checked. A check that cannot look is not a check that passed.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: breaches, error } = await db
  .from('marketing_send_invariant_breaches')
  .select('breach, send_id, campaign_reference, detail')

if (error) {
  report(0, 0)
  console.error(`${TAG} FAIL: could not read marketing_send_invariant_breaches: ${error.message}`)
  process.exit(1)
}

const { count: sends } = await db.from('marketing_send').select('id', { count: 'exact', head: true })

report(sends ?? 0, (breaches ?? []).length)

console.log(
  `${TAG} the composite key, both triggers, both allowlist checks and the view are all defined by the migrations; ${sends ?? 0} send row(s) judged`,
)

if ((breaches ?? []).length > 0) {
  for (const row of breaches) console.error(`${TAG} FAIL: ${row.breach}: ${row.detail}`)
  console.error(`${TAG} ${breaches.length} breach(es) of the campaigner invariant.`)
  process.exit(1)
}

console.log(`${TAG} OK`)
