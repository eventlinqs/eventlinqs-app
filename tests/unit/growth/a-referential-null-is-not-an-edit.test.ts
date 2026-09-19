import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
/*
 * The guard library and the guard are plain JavaScript, deliberately, so a
 * prebuild script can load them on the Vercel build host with no compiler.
 * TypeScript resolves them through allowJs, so no directive is needed here and
 * one that IS written is reported as unused.
 */
import {
  calibrationFailures,
  columnKey,
  constraintKey,
  migrationFiles,
  primaryKeyColumns,
  replaySchema,
  setNullColumnsByTable,
  setNullKeys,
  splitStatements,
  splitTopLevel,
} from '../../../scripts/guards/lib/referential-keys.mjs'
import {
  columnsRead,
  earlyReturnColumns,
  judge,
} from '../../../scripts/guards/a-referential-null-is-not-an-edit.mjs'

/**
 * A REFERENTIAL NULL IS NOT AN EDIT.
 *
 * `on delete set null` issues `UPDATE child SET fk = NULL WHERE $1 = fk` when
 * the parent goes, and that statement is how an account, an order or an event
 * is deleted. A BEFORE UPDATE FOR EACH ROW trigger with no column list re-runs
 * on it and judges the whole row again against TODAY'S configuration.
 *
 * Both halves of this were DRIVEN against TEST before a line of the fix was
 * written, and the driven proof is
 * `scripts/verify/a-referential-null-is-not-an-edit-drive.mjs`. What is tested
 * here is the part a database cannot check for itself: that the guard which
 * stops the next one is actually able to see it.
 */

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260919000140_a_referential_null_is_not_an_edit.sql')
const GROUP_RATE_MIGRATION = join(ROOT, 'supabase', 'migrations', '20260919000120_group_rate_and_its_floor.sql')

type Subject = {
  table: string
  trigger: string
  verdict: string
  detail?: string
  by?: string
  updateOf?: string[] | null
}

const judgeSql = (sql: string): Subject[] => judge(replaySchema([{ name: 'probe.sql', sql }]))

/** A table with one nullable key and a trigger function that can refuse. */
const schemaWith = (triggerClause: string, guardClause = '') => `
  create table public.t_probe (
    id uuid primary key,
    watched integer not null,
    stamped_at timestamptz,
    created_by uuid references auth.users(id) on delete set null
  );
  create or replace function public.t_probe_fn() returns trigger language plpgsql as $f$
  begin
    ${guardClause}
    if new.watched < 0 then
      raise exception 'watched must not be negative';
    end if;
    return new;
  end;
  $f$;
  create trigger t_probe_trg ${triggerClause}
    for each row execute function public.t_probe_fn();`

describe('the parser reads every shape this repository writes a key in', () => {
  it('passes its own calibration, which is the only thing standing between it and a confident blind pass', () => {
    expect(calibrationFailures()).toEqual([])
  })

  it('reads a key whose REFERENCES is wrapped onto the next line', () => {
    // The shape of `organisations.referred_by_organisation_id`. The parser this
    // replaces required the type and `references` on one line and never saw it.
    const key = columnKey('referred_by_organisation_id UUID\n    REFERENCES public.organisations(id) ON DELETE SET NULL')
    expect(key).toMatchObject({ column: 'referred_by_organisation_id', parent: 'organisations', action: 'set null' })
  })

  it('records EVERY column of a multi-column key, because the action rewrites every one', () => {
    // The shape of `marketing_link`. Keying by constraint name alone made the
    // second column overwrite the first and lost `recipient_id`.
    const keys: Array<{ column: string }> | null = constraintKey(
      'constraint marketing_link_recipient_belongs_to_campaign foreign key (recipient_id, campaign_id) ' +
        'references public.marketing_recipient (id, campaign_id) on delete set null',
    )
    expect(keys?.map(k => k.column)).toEqual(['recipient_id', 'campaign_id'])
  })

  it('applies statements in the order they are written, so a drop before a create does not delete it', () => {
    const { triggers } = replaySchema([
      {
        name: 'p.sql',
        sql: `drop trigger if exists trg_x on public.t;
              create trigger trg_x before update on public.t for each row execute function public.f();`,
      },
    ])
    expect(triggers.has('t.trg_x')).toBe(true)
  })

  it('splits statements without being fooled by semicolons inside a function body', () => {
    const statements = splitStatements(
      `create function public.f() returns trigger as $$ begin a; b; c; return new; end; $$ language plpgsql;
       create trigger t before update on public.x for each row execute function public.f();`,
    )
    expect(statements).toHaveLength(2)
  })

  it('splits a create-table body on its top-level commas only', () => {
    expect(splitTopLevel('a int, constraint c foreign key (x, y) references t (p, q), b int')).toEqual([
      'a int',
      'constraint c foreign key (x, y) references t (p, q)',
      'b int',
    ])
  })

  it('reads a primary key in both shapes, inline and as a table constraint', () => {
    expect(primaryKeyColumns('id uuid primary key default gen_random_uuid()')).toEqual(['id'])
    expect(primaryKeyColumns('primary key (a, b)')).toEqual(['a', 'b'])
    expect(primaryKeyColumns('other_column text not null')).toEqual([])
  })

  it('does not count a cascade or a bare reference as a rewrite of the child row', () => {
    const { keys } = replaySchema([
      {
        name: 'p.sql',
        sql: `create table public.t (
                id uuid primary key,
                a uuid references public.x(id) on delete cascade,
                b uuid references public.y(id));`,
      },
    ])
    expect(setNullKeys(keys)).toEqual([])
  })

  it('honours ADD COLUMN IF NOT EXISTS over a column that is already there', () => {
    // `20260504000002` tries to add `events.event_type ... references
    // event_types(slug) on delete set null` over the enum column the baseline
    // already declared. That key has never existed on any database.
    const { keys } = replaySchema([
      {
        name: 'p.sql',
        sql: `create table public.t (id uuid primary key, event_type text not null);
              alter table public.t add column if not exists event_type text
                references public.event_types(slug) on delete set null;`,
      },
    ])
    expect(setNullKeys(keys)).toEqual([])
  })
})

describe('the rule: a trigger that can refuse must decline a referential null', () => {
  it('names a bare before-update trigger on a table with a nullable key', () => {
    const [subject] = judgeSql(schemaWith('before insert or update on public.t_probe'))
    expect(subject.verdict).toBe('BROKEN')
    expect(subject.table).toBe('t_probe')
  })

  it('accepts an event list, which is the construct that stops the trigger firing at all', () => {
    const [subject] = judgeSql(schemaWith('before insert or update of watched on public.t_probe'))
    expect(subject.verdict).toBe('HELD')
    expect(subject.by).toBe('update of watched')
  })

  it('refuses an event list that names the nullable key itself', () => {
    const [subject] = judgeSql(schemaWith('before insert or update of watched, created_by on public.t_probe'))
    expect(subject.verdict).toBe('BROKEN')
    expect(subject.detail).toContain('created_by')
  })

  it('refuses an event list that has stopped covering what the function reads', () => {
    // The drift that matters more than the defect: a refusal that was supposed
    // to happen and silently does not.
    const [subject] = judgeSql(schemaWith('before insert or update of id on public.t_probe'))
    expect(subject.verdict).toBe('DRIFTED')
    expect(subject.detail).toContain('watched')
  })

  it('accepts an early return in the function, which is what events.trg_refund_policy_one_way does', () => {
    const [subject] = judgeSql(
      schemaWith('before update on public.t_probe', 'if new.watched is not distinct from old.watched then return new; end if;'),
    )
    expect(subject.verdict).toBe('HELD')
    expect(subject.by).toBe('an early return in the function')
  })

  it('refuses an early return conditioned on the nullable key, which is the opposite of the fix', () => {
    const [subject] = judgeSql(
      schemaWith('before update on public.t_probe', 'if new.created_by is not distinct from old.created_by then return new; end if;'),
    )
    expect(subject.verdict).toBe('BROKEN')
  })

  it('refuses an early return that does not mention everything the function judges', () => {
    const [subject] = judgeSql(
      schemaWith('before update on public.t_probe', 'if new.stamped_at is not distinct from old.stamped_at then return new; end if;'),
    )
    expect(subject.verdict).toBe('BROKEN')
    expect(subject.detail).toContain('watched')
  })

  it('ignores a guard clause written AFTER the raise, because it guards nothing', () => {
    const sql = `
      create table public.t_probe (
        id uuid primary key, watched integer,
        created_by uuid references auth.users(id) on delete set null);
      create or replace function public.t_probe_fn() returns trigger language plpgsql as $f$
      begin
        if new.watched < 0 then raise exception 'no'; end if;
        if new.watched is not distinct from old.watched then return new; end if;
        return new;
      end; $f$;
      create trigger t_probe_trg before update on public.t_probe
        for each row execute function public.t_probe_fn();`
    expect(judgeSql(sql)[0].verdict).toBe('BROKEN')
  })

  it('leaves alone a trigger whose function cannot raise', () => {
    const sql = `
      create table public.t_probe (
        id uuid primary key, updated_at timestamptz,
        created_by uuid references auth.users(id) on delete set null);
      create or replace function public.t_probe_fn() returns trigger language plpgsql as $f$
      begin new.updated_at := now(); return new; end; $f$;
      create trigger t_probe_trg before update on public.t_probe
        for each row execute function public.t_probe_fn();`
    expect(judgeSql(sql)).toEqual([])
  })

  it('leaves alone a table with no nullable key, which cannot have this defect', () => {
    const sql = `
      create table public.t_probe (
        id uuid primary key, watched integer,
        created_by uuid references auth.users(id) on delete cascade);
      create or replace function public.t_probe_fn() returns trigger language plpgsql as $f$
      begin if new.watched < 0 then raise exception 'no'; end if; return new; end; $f$;
      create trigger t_probe_trg before update on public.t_probe
        for each row execute function public.t_probe_fn();`
    expect(judgeSql(sql)).toEqual([])
  })

  it('reports a function whose body is not in this tree rather than assuming it is harmless', () => {
    const sql = `
      create table public.t_probe (
        id uuid primary key,
        created_by uuid references auth.users(id) on delete set null);
      create trigger t_probe_trg before update on public.t_probe
        for each row execute function public.some_function_declared_elsewhere();`
    expect(judgeSql(sql)[0].verdict).toBe('UNREADABLE')
  })
})

describe('reading a function body', () => {
  it('counts a column the function READS', () => {
    expect([...columnsRead('begin if new.state = 1 then return new; end if; end')]).toContain('state')
  })

  it('does not count a column the function only ASSIGNS, which is a stamp and not a judgement', () => {
    // `new.updated_at := now()` would otherwise demand that the event list name
    // the very column the stamp exists to change.
    expect([...columnsRead('begin new.updated_at := now(); return new; end')]).not.toContain('updated_at')
  })

  it('still counts a column that is both assigned and read', () => {
    const read = columnsRead('begin new.billable := f(new.decision); if new.billable then null; end if; end')
    expect([...read]).toContain('billable')
  })

  it('collects the columns of every leading early-return block, not just the first', () => {
    const { columns } = earlyReturnColumns(
      `begin
         if new.a is not distinct from old.a then return new; end if;
         if old.b is null and old.c = 'draft' then return new; end if;
         raise exception 'no';
       end`,
    )
    expect([...columns].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('the tree itself, which is what the guard actually judges', () => {
  const schema = replaySchema(migrationFiles())
  const subjects: Subject[] = judge(schema)

  it('finds triggers of this shape at all, so a pass is not an empty sweep', () => {
    expect(subjects.length).toBeGreaterThanOrEqual(6)
  })

  it('holds every one of them', () => {
    expect(subjects.filter(s => s.verdict !== 'HELD')).toEqual([])
  })

  it.each([
    ['event_group_rates', 'trg_event_group_rates_floor', ['event_id', 'ticket_tier_id', 'unit_price_cents']],
    ['audience_members', 'trg_audience_requires_live_consent', ['email']],
    ['marketing_send', 'trg_marketing_send_requires_approval', ['state', 'campaign_id', 'segment_fingerprint']],
  ])('%s.%s is held by an event list derived from the function body', (table, trigger, columns) => {
    const subject = subjects.find(s => s.table === table && s.trigger === trigger)
    expect(subject?.verdict).toBe('HELD')
    const declared = schema.triggers.get(`${table}.${trigger}`)
    expect(declared.updateOf).toEqual(columns)
    // Derived, not chosen: every column the function reads is in the list.
    const body = schema.functions.get(declared.fn)
    const primaryKey = schema.primaryKeys.get(table) ?? new Set()
    const read = [...columnsRead(body)].filter((c: string) => !primaryKey.has(c)).sort()
    expect(read).toEqual([...columns].sort())
  })

  it.each([
    ['audience_members', ['last_event_id', 'last_order_id', 'user_id']],
    ['event_group_rates', ['created_by']],
    ['marketing_send', ['link_code', 'sequence_step_id']],
  ])('%s carries the nullable keys the fix exists for', (table, expected) => {
    const nullable = setNullColumnsByTable(schema.keys).get(table)
    expect([...nullable].sort()).toEqual(expected)
  })

  it('leaves the two triggers that were already correct exactly as they were', () => {
    // `organisations.trg_founding_waiver_cap` and `events.trg_refund_policy_one_way`
    // predate this rule and satisfy it by two different constructs. The guard
    // accepts both rather than imposing one house style on working code.
    const founding = subjects.find(s => s.trigger === 'trg_founding_waiver_cap')
    const refund = subjects.find(s => s.trigger === 'trg_refund_policy_one_way')
    expect(founding?.by).toBe('update of founding_fee_free_until')
    expect(refund?.by).toBe('an early return in the function')
  })
})

describe('the defect the drive found on the way, which was not this item’s subject', () => {
  /**
   * /admin/pricing scrolled 243px sideways at 390 and the cause was its own
   * accessibility labels. Tailwind's `sr-only` is `position: absolute`, and an
   * absolutely positioned element resolves against its nearest POSITIONED
   * ancestor; the two `overflow-x-auto` wrappers were static, so sixteen labels
   * laid out inside a `min-w-[680px]` table escaped the scroll container and
   * landed in the document's own overflow.
   *
   * Measured: documentElement.scrollWidth 633 against innerWidth 390, and
   * `window.scrollTo(2000, 0)` really moved the page. `relative` on the wrapper
   * returns it to 390 and the table still scrolls inside its own box.
   */
  const page = readFileSync(join(ROOT, 'src', 'app', 'admin', '(authed)', 'pricing', 'page.tsx'), 'utf8')

  it('every horizontal scroll wrapper on the pricing screen is a containing block', () => {
    const wrappers = [...page.matchAll(/className="([^"]*overflow-x-auto[^"]*)"/g)].map(m => m[1])
    expect(wrappers.length).toBeGreaterThan(0)
    for (const wrapper of wrappers) expect(wrapper.split(/\s+/)).toContain('relative')
  })

  it('still has the screen-reader labels that caused it, because the fix was not to delete them', () => {
    expect(page).toContain('className="sr-only"')
  })
})

describe('the migration itself', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('changes the floor function by exactly one line, the stamp it no longer owns', () => {
    const body = (text: string) =>
      text
        .slice(text.indexOf('create or replace function public.refuse_group_rate_below_the_floor'))
        .split('$$;')[0]
    const before = body(readFileSync(GROUP_RATE_MIGRATION, 'utf8')).split('\n')
    const after = body(sql).split('\n')
    expect(before.filter(line => !after.includes(line))).toEqual(['  new.updated_at := now();'])
    expect(after.filter(line => !before.includes(line))).toEqual([])
  })

  it('gives updated_at its own unconditional trigger, so a referential null still touches the row', () => {
    expect(sql).toContain('create trigger trg_event_group_rates_touch')
    expect(sql).toMatch(/before update on public\.event_group_rates\s+for each row execute function public\.touch_event_group_rates/)
  })

  it('carries no fee-shaped literal, because the floor still lives in pricing_rules', () => {
    const stripped = sql.replace(/v_pct \/ 100/g, '')
    expect(/(^|[^0-9.a-z_])[0-9]+(\.[0-9]+)?\s*\/\s*100\b/im.test(stripped)).toBe(false)
  })
})
