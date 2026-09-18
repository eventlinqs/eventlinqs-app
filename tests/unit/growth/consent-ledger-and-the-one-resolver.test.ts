import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  decideSend,
  type LedgerConsentEvent,
  type LedgerSuppressionEvent,
} from '@/lib/consent/decide'
import {
  CONSENT_PURPOSES,
  FACILITATED_MARKETING_PURPOSE,
  LOCAL_DIGEST_PURPOSE,
  PLATFORM_TENANT_SLUG,
  TRANSACTIONAL_PURPOSES,
  coveringPurposes,
  isTransactionalPurpose,
  normaliseSubjectEmail,
  scopesForPurpose,
} from '@/lib/consent/purposes'
import { SEND_PATHS, marketingSendPaths } from '@/lib/consent/send-paths'
import {
  consentEventSentence,
  sourceDisclosureSentences,
  suppressionSentence,
} from '@/lib/consent/sentences'
import { INDEXING_POLICY } from '@/lib/seo/indexing-policy'

/**
 * GA1 v3. THE CONSENT LEDGER, AND THE ONE RESOLVER EVERY SEND ASKS.
 *
 * What a pure test can decide is here: the decision itself, at every boundary
 * and in both directions; the structural claims a later edit could quietly
 * break (append only, the wording read rather than typed, no transport in this
 * item's own files); and the registry that makes "the resolver is the only
 * door" checkable rather than aspirational.
 *
 * What a pure test CANNOT decide is whether the DATABASE refuses an UPDATE on
 * the ledger, whether a purchase composes an audience row, and whether the two
 * resolvers agree. Those are the database's behaviour, and they are proven
 * against real TEST rows by scripts/verify/ga1v3-consent-ledger-proof.sql and
 * driven in a browser by scripts/verify/ga1v3-consent-ledger-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000040_consent_ledger.sql')
const migration = readFileSync(MIGRATION, 'utf8')

const NOW = new Date('2026-09-13T10:00:00.000Z')

function grant(overrides: Partial<LedgerConsentEvent> = {}): LedgerConsentEvent {
  return {
    id: overrides.id ?? 'event-grant',
    tenantSlug: overrides.tenantSlug ?? PLATFORM_TENANT_SLUG,
    purpose: overrides.purpose ?? FACILITATED_MARKETING_PURPOSE,
    channelScope: overrides.channelScope ?? 'both',
    decision: overrides.decision ?? 'granted',
    occurredAt: overrides.occurredAt ?? '2026-09-01T00:00:00.000Z',
    wordingVersion: overrides.wordingVersion ?? 'v1',
  }
}

function suppression(
  overrides: Partial<LedgerSuppressionEvent> = {},
): LedgerSuppressionEvent {
  return {
    id: overrides.id ?? 'suppression-1',
    tenantSlug: overrides.tenantSlug ?? PLATFORM_TENANT_SLUG,
    channel: overrides.channel ?? 'both',
    scope: overrides.scope ?? 'all_marketing',
    occurredAt: overrides.occurredAt ?? '2026-09-05T00:00:00.000Z',
  }
}

function ask(
  overrides: Partial<Parameters<typeof decideSend>[0]> = {},
): Parameters<typeof decideSend>[0] {
  return {
    tenantSlug: PLATFORM_TENANT_SLUG,
    purpose: FACILITATED_MARKETING_PURPOSE,
    channel: 'email',
    now: NOW,
    maxAgeMonths: 24,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: the resolver decides one send and names the evidence', () => {
  it('granted_email_only_permits_email_and_refuses_sms', () => {
    const events = [grant({ id: 'e1', channelScope: 'email' })]

    const email = decideSend(ask({ channel: 'email' }), events, [])
    expect(email.permitted).toBe(true)
    expect(email.decidingEventId).toBe('e1')

    const sms = decideSend(ask({ channel: 'sms' }), events, [])
    expect(sms.permitted).toBe(false)
    expect(sms.reason).toContain('the consent covers email and the message is sms')
    expect(sms.decidingEventId).toBe('e1')
  })

  it('withdrawal_refuses_every_channel_for_that_tenant', () => {
    const events = [
      grant({ id: 'e1', occurredAt: '2026-09-01T00:00:00.000Z' }),
      grant({ id: 'e2', decision: 'withdrawn', occurredAt: '2026-09-05T00:00:00.000Z' }),
    ]
    for (const channel of ['email', 'sms'] as const) {
      const verdict = decideSend(ask({ channel }), events, [suppression()])
      expect(verdict.permitted).toBe(false)
      expect(verdict.decidingEventId).toBe('e2')
    }
  })

  it('withdrawal_for_tenant_one_does_not_refuse_tenant_two_own_consent', () => {
    const events = [
      grant({ id: 'ours', tenantSlug: PLATFORM_TENANT_SLUG, decision: 'withdrawn' }),
      grant({ id: 'theirs', tenantSlug: 'a-future-client', occurredAt: '2026-08-01T00:00:00.000Z' }),
    ]
    const suppressions = [suppression({ tenantSlug: PLATFORM_TENANT_SLUG })]

    const ours = decideSend(ask(), events, suppressions)
    expect(ours.permitted).toBe(false)

    const theirs = decideSend(ask({ tenantSlug: 'a-future-client' }), events, suppressions)
    expect(theirs.permitted).toBe(true)
    expect(theirs.decidingEventId).toBe('theirs')
  })

  it('consent_older_than_threshold_is_refused_until_regranted', () => {
    const stale = [grant({ id: 'old', occurredAt: '2024-01-01T00:00:00.000Z' })]
    const refused = decideSend(ask(), stale, [])
    expect(refused.permitted).toBe(false)
    expect(refused.reason).toContain('older than the 24 month threshold')
    expect(refused.decidingEventId).toBe('old')

    const regranted = decideSend(
      ask(),
      [...stale, grant({ id: 'fresh', occurredAt: '2026-09-10T00:00:00.000Z' })],
      [],
    )
    expect(regranted.permitted).toBe(true)
    expect(regranted.decidingEventId).toBe('fresh')
  })

  it('declined_is_refused_with_reason', () => {
    const verdict = decideSend(ask(), [grant({ id: 'no', decision: 'declined' })], [])
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toBe('the latest consent event is declined')
  })

  it('refusal_names_the_deciding_event_id', () => {
    const verdict = decideSend(
      ask(),
      [grant({ id: 'the-one-that-decided', channelScope: 'email' })],
      [],
    )
    // Same event, asked about a channel it does not cover: the refusal has to
    // point at the record that decided it, or an audit cannot follow it back.
    expect(decideSend(ask({ channel: 'sms' }), [grant({ id: 'the-one-that-decided', channelScope: 'email' })], []).decidingEventId).toBe(
      'the-one-that-decided',
    )
    expect(verdict.permitted).toBe(true)
  })

  it('latest_event_wins_when_a_person_grants_then_withdraws_then_grants', () => {
    const events = [
      grant({ id: 'first', occurredAt: '2026-06-01T00:00:00.000Z' }),
      grant({ id: 'second', decision: 'withdrawn', occurredAt: '2026-07-01T00:00:00.000Z' }),
      grant({ id: 'third', occurredAt: '2026-08-01T00:00:00.000Z' }),
    ]
    const verdict = decideSend(
      ask(),
      events,
      [suppression({ occurredAt: '2026-07-01T00:00:00.000Z' })],
    )
    expect(verdict.permitted).toBe(true)
    expect(verdict.decidingEventId).toBe('third')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: scope is what a consent covers, and it only runs one way', () => {
  it('a facilitated consent covers the narrower local digest', () => {
    const events = [grant({ id: 'broad', purpose: FACILITATED_MARKETING_PURPOSE })]
    const verdict = decideSend(ask({ purpose: LOCAL_DIGEST_PURPOSE }), events, [])
    expect(verdict.permitted).toBe(true)
    expect(verdict.decidingEventId).toBe('broad')
  })

  it('a digest consent never widens into marketing another organiser', () => {
    const events = [grant({ id: 'narrow', purpose: LOCAL_DIGEST_PURPOSE })]
    const verdict = decideSend(ask({ purpose: FACILITATED_MARKETING_PURPOSE }), events, [])
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toContain('no consent event is recorded')
  })

  it('coveringPurposes answers the purpose itself plus anything above it', () => {
    expect(coveringPurposes(LOCAL_DIGEST_PURPOSE).sort()).toEqual(
      [FACILITATED_MARKETING_PURPOSE, LOCAL_DIGEST_PURPOSE].sort(),
    )
    expect(coveringPurposes(FACILITATED_MARKETING_PURPOSE)).toEqual([FACILITATED_MARKETING_PURPOSE])
  })

  it('the APP 7.6 stop refuses a facilitated send and names itself', () => {
    const verdict = decideSend(
      ask(),
      [grant({ id: 'live' })],
      [suppression({ scope: 'facilitation_by_others', occurredAt: '2026-09-06T00:00:00.000Z' })],
    )
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toContain('facilitation_by_others suppression recorded on 2026-09-06')
  })

  it("one client's own suppression never silences the platform", () => {
    const verdict = decideSend(
      ask(),
      [grant({ id: 'live' })],
      [suppression({ scope: 'tenant_own', occurredAt: '2026-09-06T00:00:00.000Z' })],
    )
    expect(verdict.permitted).toBe(true)
  })

  it('a suppression recorded BEFORE a fresh grant does not refuse it', () => {
    const verdict = decideSend(
      ask(),
      [grant({ id: 'fresh', occurredAt: '2026-09-10T00:00:00.000Z' })],
      [suppression({ occurredAt: '2026-07-01T00:00:00.000Z' })],
    )
    expect(verdict.permitted).toBe(true)
  })

  it('an unknown subject is refused, with nothing to name', () => {
    const verdict = decideSend(ask(), [], [])
    expect(verdict.permitted).toBe(false)
    expect(verdict.decidingEventId).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: a transactional message is not the marketing this governs', () => {
  it('every transactional purpose is permitted with no ledger row at all', () => {
    for (const purpose of TRANSACTIONAL_PURPOSES) {
      const verdict = decideSend(ask({ purpose }), [], [suppression()])
      expect(verdict.permitted).toBe(true)
      expect(verdict.reason).toContain(purpose)
    }
  })

  it('the ticket and the receipt are in that list, because a decline must not lose them', () => {
    expect(isTransactionalPurpose('order_confirmation')).toBe(true)
    expect(isTransactionalPurpose('ticket_delivery')).toBe(true)
    expect(isTransactionalPurpose(FACILITATED_MARKETING_PURPOSE)).toBe(false)
    expect(isTransactionalPurpose(LOCAL_DIGEST_PURPOSE)).toBe(false)
  })

  it('an unknown purpose is refused rather than waved through', () => {
    const verdict = decideSend(ask({ purpose: 'something_nobody_declared' }), [grant()], [])
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toContain('unknown purpose')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: the ledger is evidence, and the schema is what says so', () => {
  it('the database refuses UPDATE and DELETE on both ledgers and on the wording', () => {
    for (const table of ['consent_events', 'suppression_events', 'consent_wordings']) {
      for (const op of ['update', 'delete']) {
        expect(migration).toContain(`before ${op} on public.${table}`)
      }
    }
    expect(migration).toContain('create or replace function public.refuse_ledger_mutation()')
  })

  it('an event cannot carry empty wording, an empty version or a null tenant', () => {
    expect(migration).toContain('consent_events_wording_present check (length(btrim(wording)) > 0)')
    expect(migration).toContain(
      'consent_events_wording_version_present check (length(btrim(wording_version)) > 0)',
    )
    expect(migration).toContain('tenant_id uuid not null references public.marketing_tenants(id)')
  })

  it('a change of wording is a new version rather than an edit', () => {
    // The unique key makes a version one row for ever; the refusal above makes
    // that row unchangeable. Together they are what lets a consent given in
    // 2026 be produced, word for word, in 2029.
    expect(migration).toContain('constraint consent_wordings_version_unique unique (purpose, version)')
    expect(migration).toContain('before update on public.consent_wordings')
  })

  it('an audience row is refused for a subject the resolver refuses', () => {
    expect(migration).toContain('before insert or update on public.audience_members')
    expect(migration).toContain('public.audience_requires_live_consent()')
    expect(migration).toContain("public.consent_permits('eventlinqs'")
  })

  it('the ageing threshold is configuration rather than a literal in a query', () => {
    expect(migration).toContain('create table if not exists public.consent_policy')
    expect(migration).toContain('max_age_months integer not null default 24')
    expect(migration).toContain('select cp.max_age_months into v_max_age from public.consent_policy')
  })

  it('the backfill carries an existing consent at the scope it was given, never wider', () => {
    const backfill = migration.slice(migration.indexOf('insert into public.consent_events ('))
    expect(backfill).toContain("'platform_local_digest'")
    expect(backfill).not.toContain("'facilitated_event_marketing'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: the wording is read, never typed into a page', () => {
  const component = readFileSync(
    join(ROOT, 'src', 'components', 'checkout', 'marketing-consent.tsx'),
    'utf8',
  )
  const seededLabel = 'Yes, email and text me about other events near me.'
  const seededBodyOpening = 'EventLinqs will send you marketing about events run by other organisers'

  it('the seeded wording is in the migration and in no page', () => {
    expect(migration).toContain(seededLabel)
    expect(migration).toContain(seededBodyOpening)
    expect(component).not.toContain(seededLabel)
    expect(component).not.toContain(seededBodyOpening)
  })

  it('the component renders the record it is handed and asks nothing without one', () => {
    expect(component).toContain('platformWording.label')
    expect(component).toContain('platformWording.body')
    expect(component).toContain('platformWording && (')
  })

  it('both checkout surfaces resolve the wording on the server', () => {
    for (const page of [
      join(ROOT, 'src', 'app', 'checkout', '[reservation_id]', 'page.tsx'),
      join(ROOT, 'src', 'app', 'squad', '[token]', 'pay', '[member_id]', 'page.tsx'),
    ]) {
      const source = readFileSync(page, 'utf8')
      expect(source).toContain('getCurrentConsentWording')
      expect(source).toContain('FACILITATED_MARKETING_PURPOSE')
    }
  })

  it('the privacy page reads the same record and names the service provider', () => {
    const privacy = readFileSync(join(ROOT, 'src', 'app', 'legal', 'privacy', 'page.tsx'), 'utf8')
    expect(privacy).toContain('getCurrentConsentWording')
    expect(privacy).toContain('Fullproof AI')
    expect(privacy).toContain('/marketing/preferences')
    expect(privacy).not.toContain(seededBodyOpening)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: the resolver is the only door, and the registry proves it', () => {
  const TRANSPORT_IMPORTS = [
    /from '@\/lib\/email\/send'/,
    /from '\.\/send'/,
    /from '\.\.\/email\/send'/,
    /from 'resend'/,
    /from 'twilio'/,
  ]

  function transportReachingFiles(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8')
          if (TRANSPORT_IMPORTS.some((re) => re.test(source))) {
            out.push(full.slice(ROOT.length + 1).replace(/\\/g, '/'))
          }
        }
      }
    }
    walk(join(ROOT, 'src'))
    return out.sort()
  }

  it('every module that can reach a transport is classified', () => {
    const registered = new Set(SEND_PATHS.map((p) => p.file))
    const reaching = transportReachingFiles()
    expect(reaching.length).toBeGreaterThan(0)
    for (const file of reaching) {
      expect(registered.has(file), `${file} reaches a transport and is not in the registry`).toBe(true)
    }
  })

  it('every marketing send path calls the resolver in its own file', () => {
    const marketing = marketingSendPaths()
    expect(marketing.length).toBeGreaterThan(0)
    for (const path of marketing) {
      const source = readFileSync(join(ROOT, path.file), 'utf8')
      const calls = /resolveSend\s*\(/.test(source) || /filterPermittedRecipients\s*\(/.test(source)
      expect(calls, `${path.file} is marketing and never asks the resolver`).toBe(true)
    }
  })

  it('every registered path still exists and carries a reason', () => {
    for (const path of SEND_PATHS) {
      expect(existsSync(join(ROOT, path.file)), `${path.file} is registered and missing`).toBe(true)
      if (path.kind !== 'transport') expect(path.purpose.length).toBeGreaterThan(0)
      expect(path.reason.trim().length).toBeGreaterThan(20)
    }
  })

  it('nothing this item added or changed imports a transport', () => {
    const OWN_FILES = [
      'src/lib/consent/purposes.ts',
      'src/lib/consent/decide.ts',
      'src/lib/consent/ledger.ts',
      'src/lib/consent/resolver.ts',
      'src/lib/consent/sentences.ts',
      'src/lib/consent/send-paths.ts',
      'src/lib/consent/checkout-answer.ts',
      'src/lib/consent/record.ts',
      'src/app/actions/marketing-rights.ts',
      'src/app/marketing/preferences/page.tsx',
      'src/app/marketing/preferences/rights-form.tsx',
      'src/app/marketing/preferences/[token]/page.tsx',
      'src/app/admin/(authed)/audience/page.tsx',
      'src/lib/audience/read.ts',
    ]
    for (const file of OWN_FILES) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      for (const re of TRANSPORT_IMPORTS) {
        expect(re.test(source), `${file} imports a transport and this item sends nothing`).toBe(false)
      }
      expect(source).not.toMatch(/sendEmail\s*\(/)
      expect(source).not.toMatch(/sendWebPush\s*\(/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: a record is only evidence if a person can read it', () => {
  it('a grant reads as a sentence with the date, the place and the channels', () => {
    const sentence = consentEventSentence({
      purpose: FACILITATED_MARKETING_PURPOSE,
      decision: 'granted',
      channelScope: 'both',
      wordingVersion: 'v1',
      captureSurface: 'checkout',
      citySlug: 'geelong',
      occurredAt: '2026-09-13T04:11:22.000Z',
    })
    expect(sentence).toContain('13 September 2026')
    expect(sentence).toContain('at the checkout')
    expect(sentence).toContain('email and SMS')
    expect(sentence).toContain('geelong')
    expect(sentence).toContain('version v1')
  })

  it('a decline says plainly that nothing was ever sent on it', () => {
    const sentence = consentEventSentence({
      purpose: LOCAL_DIGEST_PURPOSE,
      decision: 'declined',
      channelScope: 'email',
      wordingVersion: 'v1',
      captureSurface: 'squad-checkout',
      citySlug: null,
      occurredAt: '2026-09-13T04:11:22.000Z',
    })
    expect(sentence).toContain('asked and said no')
    expect(sentence).toContain('while paying for a group booking')
  })

  it('a suppression says what it stopped and on which channels', () => {
    expect(
      suppressionSentence({
        channel: 'both',
        scope: 'facilitation_by_others',
        reason: 'asked',
        requestSource: 'rights-page',
        occurredAt: '2026-09-13T04:11:22.000Z',
      }),
    ).toContain('not used to help other organisations market to it')
  })

  it('the source disclosure answers the question people are really asking', () => {
    const lines = sourceDisclosureSentences([
      {
        purpose: LOCAL_DIGEST_PURPOSE,
        decision: 'granted',
        channelScope: 'email',
        wordingVersion: 'v1',
        captureSurface: 'newsletter-city',
        citySlug: 'geelong',
        occurredAt: '2026-05-02T00:00:00.000Z',
      },
    ])
    expect(lines.join(' ')).toContain('on a city page newsletter panel')
    expect(lines.join(' ')).toContain('2 May 2026')
    expect(lines.join(' ')).toContain('does not buy marketing lists')
  })

  it('a migrated record says so rather than pretending to a surface it never had', () => {
    const sentence = consentEventSentence({
      purpose: LOCAL_DIGEST_PURPOSE,
      decision: 'granted',
      channelScope: 'email',
      wordingVersion: 'v1',
      captureSurface: 'migrated:checkout',
      citySlug: null,
      occurredAt: '2026-07-04T00:00:00.000Z',
    })
    expect(sentence).toContain('before the consent ledger existed')
  })

  it('nothing is claimed for an address with no record', () => {
    const lines = sourceDisclosureSentences([])
    expect(lines[0]).toContain('holds no marketing consent record')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: the rights routes exist and are reachable without a login', () => {
  it('both routes are built', () => {
    expect(existsSync(join(ROOT, 'src', 'app', 'marketing', 'preferences', 'page.tsx'))).toBe(true)
    expect(
      existsSync(join(ROOT, 'src', 'app', 'marketing', 'preferences', '[token]', 'page.tsx')),
    ).toBe(true)
  })

  it('neither reads a session', () => {
    for (const file of [
      join(ROOT, 'src', 'app', 'marketing', 'preferences', 'page.tsx'),
      join(ROOT, 'src', 'app', 'marketing', 'preferences', '[token]', 'page.tsx'),
      join(ROOT, 'src', 'app', 'actions', 'marketing-rights.ts'),
    ]) {
      const source = readFileSync(file, 'utf8')
      for (const tell of ['auth.getUser', 'auth.getSession', 'requireUser', 'requireAdminSession']) {
        expect(source.includes(tell), `${file} reads a session`).toBe(false)
      }
    }
  })

  it('both carry an indexing decision, and it is never index', () => {
    for (const route of ['/marketing/preferences', '/marketing/preferences/[token]']) {
      const entry = INDEXING_POLICY.find((e) => e.route === route)
      expect(entry, `${route} has no indexing policy entry`).toBeTruthy()
      expect(entry?.klass).toBe('never')
    }
  })

  it('the token page answers with the resolver rather than describing it', () => {
    const page = readFileSync(
      join(ROOT, 'src', 'app', 'marketing', 'preferences', '[token]', 'page.tsx'),
      'utf8',
    )
    expect(page).toContain('resolveSend')
    expect(page).toContain('sourceDisclosureSentences')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 v3: the taxonomy is one decision written in two languages', () => {
  it('every purpose in TypeScript is seeded in SQL with the same coverage', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(migration).toContain(`'${purpose.purpose}'`)
    }
    expect(migration).toContain("array['platform_local_digest']")
  })

  it('the scopes a consent is captured with are declared, never blank', () => {
    for (const purpose of [FACILITATED_MARKETING_PURPOSE, LOCAL_DIGEST_PURPOSE]) {
      const scopes = scopesForPurpose(purpose)
      expect(scopes.thirdPartyScope.length).toBeGreaterThan(20)
      expect(scopes.suppressionScope.length).toBeGreaterThan(20)
    }
  })

  it('an address is matched the same way everywhere', () => {
    expect(normaliseSubjectEmail('  Lane-B.Buyer@Example.COM ')).toBe('lane-b.buyer@example.com')
  })
})
