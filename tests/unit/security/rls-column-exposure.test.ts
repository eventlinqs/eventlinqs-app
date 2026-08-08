/**
 * The guard for the world-readable-column class.
 *
 * WHAT WENT WRONG TWICE. Row Level Security filters ROWS, never COLUMNS. A
 * permissive SELECT policy with no TO clause applies to PUBLIC, which includes
 * `anon`, and the anon key is NEXT_PUBLIC and sits in every page's source. So
 * one such policy publishes every column of every matching row to anyone with a
 * browser.
 *
 *   20260625000002  closed it on profiles      (email, full_name, phone)
 *   20260808000010  closed it on organisations (email, phone, stripe_*),
 *                   event_artists (invite_token) and venues (stripe_*)
 *
 * The first fix dropped a policy. That fixed the INSTANCE and left the CLASS
 * alive, which is why there was a second time. These tests exist so there is no
 * third: they fail when the shape reappears on ANY table, including tables that
 * do not exist yet.
 *
 * The negative cases matter more than the positive one. A gate that only ever
 * passes proves nothing, so each test below asserts the scanner FIRES on a
 * specific reintroduction, and one asserts it fires on the exact policy text
 * that 20260625000002 removed.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  scanMigrations,
  DEFAULT_MIGRATIONS_DIR,
  ACCEPTED,
} from '../../../scripts/security/rls-exposure-scan.mjs'

/** A scratch migration directory seeded with the real set, so a test exercises
 *  the true schema rather than a toy one. */
function realMigrationsPlus(extraFilename: string, extraSql: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rls-scan-'))
  for (const f of readdirSync(DEFAULT_MIGRATIONS_DIR)) {
    if (f.endsWith('.sql')) copyFileSync(path.join(DEFAULT_MIGRATIONS_DIR, f), path.join(dir, f))
  }
  writeFileSync(path.join(dir, extraFilename), extraSql)
  return dir
}

function synthetic(sql: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rls-synth-'))
  writeFileSync(path.join(dir, '20990101000001_synthetic.sql'), sql)
  return dir
}

const temps: string[] = []
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true })
})

describe('the scanner is actually parsing the schema', () => {
  // Without this, every other assertion could pass by parsing nothing at all.
  const result = scanMigrations()

  it('finds a realistic number of policies and tables', () => {
    expect(result.policies.size).toBeGreaterThan(100)
    expect(result.columns.size).toBeGreaterThan(50)
  })

  it('reconstructs columns including ones added by ALTER TABLE', () => {
    const org = result.columns.get('organisations')
    expect(org).toBeDefined()
    // in the baseline CREATE TABLE
    expect(org!.has('email')).toBe(true)
    // added later by ALTER TABLE, so this proves ALTER parsing works
    expect(org!.has('stripe_requirements')).toBe(true)
  })

  it('honours DROP POLICY, so a closed hole is not re-reported', () => {
    // 20260520000001 dropped the blanket squads read policy. If DROP were
    // ignored, squads.share_token would surface as an exposure and this suite
    // would be reporting a defect that was fixed months ago.
    expect([...result.policies.keys()]).not.toContain(
      'squads::Squads are viewable by anyone with the share token',
    )
    const squadTokenExposed = [...result.live, ...result.accepted].some(
      (f) => f.key === 'squads.share_token',
    )
    expect(squadTokenExposed).toBe(false)
  })
})

describe('the current tree is clean', () => {
  it('reports no unaccepted exposure', () => {
    const { live } = scanMigrations()
    const detail = live.map((f) => `${f.key} (${f.why})`).join('\n')
    expect(live, `unaccepted column exposures:\n${detail}`).toHaveLength(0)
  })

  it('proves the fix is a column privilege, not a dropped policy', () => {
    // organisations must STILL be publicly browsable at the row level, because
    // every public event surface embeds organisation:organisations(name). The
    // protection has to come from the grant, not from hiding the row.
    const { policies, grants } = scanMigrations()
    const browse = [...policies.values()].find(
      (p) => p.table === 'organisations' && p.cmd === 'SELECT' && !/auth\./.test(p.using),
    )
    expect(browse, 'organisations lost its public browse policy').toBeDefined()

    const anon = grants.get('organisations')?.get('anon')
    expect(anon?.mode).toBe('columns')
    expect([...anon!.cols].sort()).toEqual(
      ['description', 'id', 'logo_url', 'name', 'slug', 'website'].sort(),
    )
    expect(anon!.cols.has('email')).toBe(false)
    expect(anon!.cols.has('stripe_account_id')).toBe(false)
  })

  it('withdraws the artist claim credential from untrusted roles', () => {
    const { grants } = scanMigrations()
    for (const role of ['anon', 'authenticated']) {
      const st = grants.get('event_artists')?.get(role)
      expect(st?.mode, `event_artists/${role}`).toBe('columns')
      expect(st!.cols.has('invite_token')).toBe(false)
      // the lineup itself stays public: who is playing is not a secret
      expect(st!.cols.has('artist_id')).toBe(true)
    }
  })
})

describe('NEGATIVE: the gate fires when the class reappears', () => {
  it('fires on the exact policy that 20260625000002 removed', () => {
    // Verbatim from the baseline, resurrected. This is the regression the
    // founder asked to see fire.
    const dir = realMigrationsPlus(
      '20990101000002_resurrect_profiles_leak.sql',
      `CREATE POLICY "Public profiles are viewable by everyone"\n` +
        `  ON public.profiles FOR SELECT\n` +
        `  USING (true);\n`,
    )
    temps.push(dir)

    const { live } = scanMigrations(dir)
    const keys = live.map((f) => f.key)
    expect(keys).toContain('profiles.email')
    expect(keys).toContain('profiles.phone')
    expect(keys).toContain('profiles.full_name')
  })

  it('fires on a brand-new table nobody has written yet', () => {
    // The point of a class guard: it must catch a table that did not exist when
    // the guard was authored.
    const dir = synthetic(`
      CREATE TABLE public.supplier_contacts (
        id UUID PRIMARY KEY,
        company TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT
      );
      ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "suppliers are viewable by everyone"
        ON public.supplier_contacts FOR SELECT USING (true);
    `)
    temps.push(dir)

    const { live } = scanMigrations(dir)
    expect(live.map((f) => f.key)).toEqual(
      expect.arrayContaining(['supplier_contacts.email', 'supplier_contacts.phone']),
    )
  })

  it('fires on a leaked bearer token, not just on PII', () => {
    const dir = synthetic(`
      CREATE TABLE public.magic_invites (
        id UUID PRIMARY KEY,
        label TEXT,
        claim_token TEXT NOT NULL
      );
      CREATE POLICY "invites readable" ON public.magic_invites
        FOR SELECT USING (true);
    `)
    temps.push(dir)

    const { live } = scanMigrations(dir)
    const hit = live.find((f) => f.key === 'magic_invites.claim_token')
    expect(hit).toBeDefined()
    expect(hit!.why).toMatch(/credential/)
  })

  it('fires when a column privilege is widened back to the whole table', () => {
    // The subtle regression: someone "fixes a bug" by re-granting the table.
    const dir = realMigrationsPlus(
      '20990101000003_regrant_organisations.sql',
      `GRANT SELECT ON public.organisations TO anon;\n`,
    )
    temps.push(dir)

    const { live } = scanMigrations(dir)
    expect(live.map((f) => f.key)).toEqual(expect.arrayContaining(['organisations.email']))
  })

  it('treats authenticated as untrusted, because signup is free', () => {
    const dir = realMigrationsPlus(
      '20990101000004_regrant_authenticated.sql',
      `GRANT SELECT ON public.organisations TO authenticated;\n`,
    )
    temps.push(dir)

    const { live } = scanMigrations(dir)
    const hit = live.find((f) => f.key === 'organisations.email')
    expect(hit, 'a free account must not be a security boundary').toBeDefined()
    expect([...hit!.roles]).toContain('authenticated')
  })
})

describe('NEGATIVE CONTROL: the gate does not fire on safe shapes', () => {
  // A guard that fires on everything is as useless as one that fires on
  // nothing. These pin the two exclusions that keep it honest.

  it('does not fire on a service-role-only policy with no TO clause', () => {
    // This exclusion is load-bearing: without it the first pass reported 33
    // tables instead of 2, because `USING (auth.role() = 'service_role')` has no
    // TO clause but can never match anon.
    const dir = synthetic(`
      CREATE TABLE public.secret_ledger (
        id UUID PRIMARY KEY,
        user_id UUID,
        email TEXT
      );
      CREATE POLICY "Service role manages ledger" ON public.secret_ledger
        FOR ALL USING (auth.role() = 'service_role');
    `)
    temps.push(dir)
    expect(scanMigrations(dir).live).toHaveLength(0)
  })

  it('does not fire on an own-row policy keyed on auth.uid()', () => {
    const dir = synthetic(`
      CREATE TABLE public.private_notes (
        id UUID PRIMARY KEY,
        user_id UUID,
        email TEXT
      );
      CREATE POLICY "own rows only" ON public.private_notes
        FOR SELECT USING (user_id = auth.uid());
    `)
    temps.push(dir)
    expect(scanMigrations(dir).live).toHaveLength(0)
  })

  it('does not fire once the correct column privilege is applied', () => {
    // Proves the prescribed remedy actually satisfies the gate, so the error
    // message is not sending anyone on a wild goose chase.
    const dir = synthetic(`
      CREATE TABLE public.supplier_contacts (
        id UUID PRIMARY KEY,
        company TEXT NOT NULL,
        email TEXT NOT NULL
      );
      CREATE POLICY "suppliers are viewable by everyone"
        ON public.supplier_contacts FOR SELECT USING (true);
      REVOKE SELECT ON public.supplier_contacts FROM anon;
      REVOKE SELECT ON public.supplier_contacts FROM authenticated;
      GRANT SELECT (id, company) ON public.supplier_contacts TO anon;
      GRANT SELECT (id, company) ON public.supplier_contacts TO authenticated;
    `)
    temps.push(dir)
    expect(scanMigrations(dir).live).toHaveLength(0)
  })
})

describe('the reviewed baseline stays reviewable', () => {
  it('every accepted entry carries a written reason', () => {
    for (const [key, note] of Object.entries(ACCEPTED)) {
      expect(typeof note, `${key} has no reason`).toBe('string')
      expect((note as string).length, `${key} reason is too thin`).toBeGreaterThan(40)
      expect(note as string).toMatch(/ACCEPTED|DEFERRED/)
    }
  })

  it('does not quietly accept a credential or a contact detail', () => {
    // Deferring a person FK is a judgement call. Deferring a password or a
    // token never is, so make that impossible to do by accident.
    for (const key of Object.keys(ACCEPTED)) {
      expect(key, `${key} must not be silently accepted`).not.toMatch(
        /(token|secret|password|recovery)$/i,
      )
      expect(key).not.toMatch(/\.(email|phone|full_name)$/i)
    }
  })
})
