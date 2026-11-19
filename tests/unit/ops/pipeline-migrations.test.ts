import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backupSql, classify, planOf, PRESERVED, splitRefusal, workdirPlan } from '../../../scripts/ops/pipeline-migrations.mjs'

/*
 * MIGRATIONS BY THE PIPELINE, WITH NO PERSON IN THE LOOP (car M; Lawal's word of 19 November 2026, the PM's 04:42 items 2
 * and 3). Each safety is held here, and each drill shows the rule red on the shape it forbids before it is green on the
 * real one: the test database before production; a backup of what a destructive migration touches, before production;
 * no migration deletes the records law 19 (d) preserves; the ledger read back, and a WARNING on any failure.
 */
const CI = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n')
/** The 'migrate production' job's own block in ci.yml, from its key to the next job's key. */
const WORKFLOW = CI.slice(CI.indexOf('\n  migrate:\n'), CI.indexOf('\n  production-parity:\n'))

/** The order the workflow's steps run in, by their names. */
function stepOrder(text: string): string[] {
  return [...text.matchAll(/^\s+- name: (.+)$/gm)].map((m) => m[1].trim())
}
const at = (steps: string[], name: string) => steps.findIndex((s) => s.startsWith(name))

/** The rule over a workflow's text: TEST before production, the backup before production, the read back, the WARNING. */
function judgeWorkflow(text: string): string[] {
  const s = stepOrder(text)
  const faults: string[] = []
  const test = at(s, '2. The test database first')
  const backup = at(s, '3. A backup')
  const prod = at(s, '4. Production')
  const verify = s.findIndex((x) => x.startsWith("4. Production's ledger read back"))
  if (test < 0 || prod < 0 || test > prod) faults.push('the test database does not come before production')
  if (backup < 0 || backup > prod) faults.push('the backup does not come before production')
  if (verify < 0 || verify < prod) faults.push('production is not read back after it')
  if (!text.includes("if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository }}")) {
    faults.push('it does not run on a ready pull request of this repository and on main')
  }
  if (!/SUPABASE_YES: '1'/.test(text) || !/supabase db push --yes --remote/.test(text)) faults.push("the CLI's hosted consent is not given")
  if (!/concurrency:\n\s+group: migrate-production\n\s+cancel-in-progress: false/.test(text)) faults.push('two runs could push at once')
  return faults
}

/** Production parity waits for the job and runs whatever its result: a skipped required check reads as passing. */
function judgeParity(ci: string): string[] {
  const parity = ci.slice(ci.indexOf('\n  production-parity:\n'), ci.indexOf('\n  test:\n'))
  const faults: string[] = []
  if (!parity.includes('\n    needs: migrate\n')) faults.push('production parity does not wait for the migrations')
  if (!parity.includes('if: ${{ !cancelled() && ')) faults.push('production parity would be skipped when the migrations fail')
  // On main a failed migration reaches the one outage email main already sends (push only, close-out UX4.5).
  const alarm = ci.slice(ci.indexOf('\n  main-red-alert:\n'))
  if (!/needs: \[[^\]]*\bmigrate\b[^\]]*\]/.test(alarm)) faults.push('a failed migration on main sends no WARNING')
  if (!alarm.includes('echo "migrate production       : ${MIGRATE}"')) faults.push('the WARNING does not name the migrations')
  return faults
}

describe('the workflow: the test database first, the backup before production, the read back, the WARNING', () => {
  it('the real workflow holds every rule', () => {
    expect(judgeWorkflow(WORKFLOW)).toEqual([])
  })
  it('DRILL: production moved before the test database is red', () => {
    const swapped = WORKFLOW.replace('- name: 2. The test database first', '- name: X').replace('- name: 4. Production\n', '- name: 2. The test database first\n').replace('- name: X', '- name: 4. Production')
    expect(judgeWorkflow(swapped)).toContain('the test database does not come before production')
  })
  it('DRILL: main red alert that does not wait for the migrations is red', () => {
    expect(judgeParity(CI.replace('needs: [verify, types-drift-guard, migrate, production-parity, test]', 'needs: [verify, types-drift-guard, production-parity, test]'))).toContain('a failed migration on main sends no WARNING')
  })
  it('production parity waits for the migrations and is never skipped by their failure', () => {
    expect(judgeParity(CI)).toEqual([])
  })
  it('DRILL: parity that only runs on the job success, or does not wait, is red', () => {
    expect(judgeParity(CI.replace('if: ${{ !cancelled() && ', 'if: ${{ success() && '))).toContain('production parity would be skipped when the migrations fail')
    expect(judgeParity(CI.replace('\n    needs: migrate\n', '\n'))).toContain('production parity does not wait for the migrations')
  })
  it('DRILL: the backup step taken out is red', () => {
    expect(judgeWorkflow(WORKFLOW.replace('- name: 3. A backup of every table a destructive migration names', '- name: a later note'))).toContain('the backup does not come before production')
  })
})

describe('what a migration does, read from its own SQL', () => {
  it('a migration that only adds is not destructive', () => {
    expect(classify('create table if not exists public.x (id int);\nalter table public.y add column z text;')).toEqual({ destructive: false, losesData: false, kinds: [], touches: [], refused: [] })
  })
  it('a drop, a rename or a delete is destructive and names its tables; comments are not read', () => {
    const c = classify('-- drop table public.ignored\nalter table public.social_pieces drop constraint if exists social_pieces_kind_check;\nalter table public.events rename column a to b;\ndelete from public.social_piece_figures where false;')
    expect(c.destructive).toBe(true)
    expect(c.kinds).toEqual(['delete', 'drop constraint', 'rename'])
    expect(c.touches).toEqual(['public.events', 'public.social_piece_figures', 'public.social_pieces'])
    expect(c.refused).toEqual([])
  })
  it('DRILL: a delete or truncate of a record law 19 (d) preserves is refused, whatever else it does', () => {
    for (const sql of ['delete from public.orders where true;', 'truncate table tickets;', 'drop table if exists public.payments;', 'delete from events where id is null;', 'truncate ledger_entries;']) {
      expect(classify(sql).refused.length, sql).toBe(1)
    }
    expect(PRESERVED.test('public.listing_checks')).toBe(true)
    expect(PRESERVED.test('public.social_pieces')).toBe(false)
  })
  it('a migration on main that rewrites a rule (20261113113001, applied 13 November) reads as destructive, refused for nothing', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261113113001_listing_candidates_capture_holds.sql'), 'utf8')
    const c = classify(sql)
    expect(c.destructive).toBe(true)
    expect(c.refused).toEqual([])
  })
  it('DRILL, law 14 (gg): a pull request that changes code and drops a column is refused and split; a rewritten constraint beside code is not', () => {
    const dropsColumn = planOf([{ file: 'x.sql' }], () => 'alter table public.events drop column old_note;')
    expect(splitRefusal(dropsColumn, true)).toMatch(/rides alone, after the code that copes is live \(law 14 \(gg\)\): x\.sql \(drop column\)/)
    expect(splitRefusal(dropsColumn, false)).toBeNull()
    const rewritesRule = planOf([{ file: 'y.sql' }], () => 'alter table public.social_pieces drop constraint if exists k; alter table public.social_pieces add constraint k check (true);')
    expect(splitRefusal(rewritesRule, true)).toBeNull()
  })
  it('the plan joins every pending migration', () => {
    const p = planOf([{ file: 'a.sql' }, { file: 'b.sql' }], (f: string) => (f === 'a.sql' ? 'create table public.a (id int);' : 'alter table public.b drop column c;'))
    expect(p).toMatchObject({ pending: ['a.sql', 'b.sql'], destructive: true, tables: ['public.b'], refused: [] })
  })
})

describe("the test database is pushed through a scratch folder that reads its whole history", () => {
  // TEST's history on 19 November 2026 (ledger-vkapkibzokmfaxqogypq.json): ten versions from branches never merged, and
  // four of production's own it lacked. The CLI refused it: 'DbPushMissingLocalError: Remote migration versions not
  // found in local migrations directory'.
  const ONLY_ON_TEST = ['20260908000001', '20260908000002', '20260908000003', '20260908000004', '20260921000030', '20260921000050', '20260929000010', '20261024000001', '20261102080001', '20261118103501']
  const tree = ['20261115091001_same_day_verification.sql', '20261116150001_health_sentinel_runs.sql', '20261118230001_social_figures_from_blotato.sql', '20261119040001_sender_mode_record.sql', 'README.md']
  it('every version only TEST holds gets an empty placeholder, every tree migration is copied, nothing else', () => {
    const plan = workdirPlan(tree, new Set([...ONLY_ON_TEST, '20261115091001']))
    expect(plan.stubs).toEqual(ONLY_ON_TEST)
    expect(plan.copy).toEqual(tree.filter((f) => f.endsWith('.sql')))
  })
  it("DRILL: a folder of the tree alone leaves TEST's history unexplained, which is the refusal the CLI gave", () => {
    const treeOnly = { copy: tree.filter((f) => f.endsWith('.sql')), stubs: [] as string[] }
    const explained = new Set([...treeOnly.copy.map((f) => f.split('_')[0]), ...treeOnly.stubs])
    expect(ONLY_ON_TEST.filter((v) => !explained.has(v))).toHaveLength(10)
    const plan = workdirPlan(tree, new Set(ONLY_ON_TEST))
    const whole = new Set([...plan.copy.map((f: string) => f.split('_')[0]), ...plan.stubs])
    expect(ONLY_ON_TEST.filter((v) => !whole.has(v))).toEqual([])
  })
  it('the job pushes TEST from that folder with --include-all, and production from the tree, both without a link', () => {
    expect(WORKFLOW).toContain('node scripts/ops/pipeline-migrations.mjs test-workdir "$RUNNER_TEMP/test-db"')
    expect(WORKFLOW).toContain('supabase db push --yes --include-all --remote="$TEST_REF" --workdir "$RUNNER_TEMP/test-db"')
    expect(WORKFLOW).toContain('supabase db push --yes --remote="$PRODUCTION_REF"')
    expect(WORKFLOW).not.toContain('supabase link')
  })
})

describe('the backup stays inside the database, never in a public artifact', () => {
  it('each table is copied to migration_backups, which no client role may read; a table the migration creates is skipped', () => {
    const sql = backupSql(['public.social_pieces', 'public.events'], 'abc12345_202611190400')
    expect(sql).toContain('create schema if not exists migration_backups;')
    expect(sql).toContain('revoke all on schema migration_backups from public, anon, authenticated;')
    expect(sql).toContain("if to_regclass('public.social_pieces') is not null then execute 'create table migration_backups.public__social_pieces__abc12345_202611190400 as table public.social_pieces'")
    expect(sql.match(/revoke all on migration_backups\./g)).toHaveLength(2)
  })
  it('DRILL: a name that is not a plain table name is refused, so nothing can be injected', () => {
    expect(() => backupSql(['public.x; drop table orders'], 's')).toThrow(/not a table name/)
  })
  it('the workflow keeps no backup as an artifact (this repository is public)', () => {
    expect(WORKFLOW).not.toMatch(/upload-artifact/)
    expect(WORKFLOW).toMatch(/node scripts\/ops\/pipeline-migrations\.mjs backup/)
  })
})
