import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  MATCH_COMPONENTS,
  MatchConfigError,
  assertWeightsAreUsable,
  methodSentence,
  postcodeBandFor,
  priceFit,
  recencyFit,
  scoreAudienceMember,
  spendFit,
  type AudienceRowForScoring,
  type EventForScoring,
  type MatchConfig,
} from '@/lib/matching/score'
import { composeRun } from '@/lib/matching/compose'
import {
  SUPPRESSION_REASONS,
  SUPPRESSION_SENTENCES,
  emptyFunnel,
  isBelowFloor,
  suppressionReasonFor,
} from '@/lib/matching/suppress'
import { COMMUNITY_TO_TAGS } from '@/lib/communities/tag-bridge'

/**
 * GA2. THE MATCHER, HELD TO THE ARITHMETIC IT CLAIMS.
 *
 * Every rule that decides who hears about an event is pure, so it is tested
 * here at every boundary and in both directions. What is NOT decided here is
 * whether the database refuses a score row for somebody the resolver refuses,
 * and whether 500 rows cap at 50 with contiguous ranks: those are the database
 * and they are proven by scripts/verify/ga2-matcher-proof.sql and driven in a
 * browser by scripts/verify/ga2-matcher-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000050_matcher.sql')
const migration = readFileSync(MIGRATION, 'utf8')

const NOW = new Date('2026-09-13T00:00:00.000Z')

function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    methodName: 'weighted-additive',
    methodVersion: 'v1',
    recencyHalfLifeDays: 120,
    priceBandTolerance: 1,
    sendCooldownDays: 14,
    minimumScoreFloor: 20,
    maxRecipientsPerRun: 5000,
    weightSumTolerance: 0.001,
    weights: [
      { component: 'category', weight: 0.24, sentence: 'They have bought a ticket in this category before.' },
      { component: 'community', weight: 0.16, sentence: 'This event belongs to a community they have bought from before.' },
      { component: 'city', weight: 0.14, sentence: 'They have bought a ticket in this city before.' },
      { component: 'postcode', weight: 0.07, sentence: 'The venue is near a postcode they have bought near before.' },
      { component: 'price', weight: 0.11, sentence: 'This ticket costs about what they usually pay.' },
      { component: 'recency', weight: 0.13, sentence: 'They bought recently, and the pull of a purchase halves as it ages.' },
      { component: 'spend', weight: 0.05, sentence: 'They have spent more with EventLinqs over time than most buyers.' },
      { component: 'channel_consent', weight: 0.10, sentence: 'They have agreed to hear from EventLinqs on the channel this campaign uses.' },
    ],
    postcodeBands: [
      { band: 1, sharedPrefix: 4, fit: 1, label: 'the same postcode' },
      { band: 2, sharedPrefix: 2, fit: 0.6, label: 'the same postal district' },
      { band: 3, sharedPrefix: 1, fit: 0.3, label: 'the same state postcode range' },
      { band: 4, sharedPrefix: 0, fit: 0, label: 'nowhere near' },
    ],
    ...overrides,
  }
}

/**
 * A buyer, with the defaults overridden BY KEY PRESENCE rather than by a
 * nullish fallback.
 *
 * The first version of this helper used `overrides.postcode ?? '3220'`, so
 * every test that deliberately passed null got the default back and three
 * assertions failed against a product that was right. A fixture that quietly
 * refuses the value it was handed is worse than no fixture.
 */
function member(overrides: Partial<AudienceRowForScoring> = {}): AudienceRowForScoring {
  const base: AudienceRowForScoring = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'lane-b.buyer@example.test',
    categorySlugs: ['music'],
    communitySlugs: ['greek'],
    citySlugs: ['geelong'],
    postcode: '3220',
    priceBand: '30-to-59',
    lastOrderAt: '2026-09-01T00:00:00.000Z',
    lifetimeSpendCents: 10_000,
    consentChannel: 'both',
  }
  return { ...base, ...overrides }
}

function event(overrides: Partial<EventForScoring> = {}): EventForScoring {
  const base: EventForScoring = {
    id: 'event-1',
    categorySlug: 'music',
    communitySlugs: ['greek'],
    citySlug: 'geelong',
    postcode: '3220',
    medianTierPriceCents: 4500,
  }
  return { ...base, ...overrides }
}

const ask = { now: NOW, channel: 'email' as const }

// ─────────────────────────────────────────────────────────────────────────────
describe('GA2: the scorer, component by component', () => {
  it('bought_this_category_scores_higher_than_never_bought', () => {
    const bought = scoreAudienceMember(member({ categorySlugs: ['music'] }), event(), config(), ask)
    const never = scoreAudienceMember(member({ categorySlugs: ['comedy'] }), event(), config(), ask)
    expect(bought.score).toBeGreaterThan(never.score)
    expect(bought.score - never.score).toBeCloseTo(24, 1)
  })

  it('taxonomy_value_read_from_table_not_literal', () => {
    // The scorer compares one array against another and names no community and
    // no category of its own. A pasted list would survive a rename of the
    // taxonomy and start scoring against a value the platform stopped showing.
    const source = readFileSync(join(ROOT, 'src', 'lib', 'matching', 'score.ts'), 'utf8')
    for (const slug of Object.keys(COMMUNITY_TO_TAGS)) {
      expect(source, `the scorer names the community ${slug}`).not.toContain(`'${slug}'`)
    }
    // And the event's own community value is resolved from the taxonomy table.
    const run = readFileSync(join(ROOT, 'src', 'lib', 'matching', 'run.ts'), 'utf8')
    expect(run).toContain("from('community_tag_map')")
  })

  it('same_city_beats_different_city', () => {
    const same = scoreAudienceMember(member({ citySlugs: ['geelong'] }), event({ citySlug: 'geelong' }), config(), ask)
    const different = scoreAudienceMember(member({ citySlugs: ['darwin'] }), event({ citySlug: 'geelong' }), config(), ask)
    expect(same.score).toBeGreaterThan(different.score)
  })

  it('postcode_inside_first_band_beats_second_band', () => {
    const exact = scoreAudienceMember(member({ postcode: '3220' }), event({ postcode: '3220' }), config(), ask)
    const district = scoreAudienceMember(member({ postcode: '3250' }), event({ postcode: '3220' }), config(), ask)
    const nowhere = scoreAudienceMember(member({ postcode: '6000' }), event({ postcode: '3220' }), config(), ask)
    expect(exact.score).toBeGreaterThan(district.score)
    expect(district.score).toBeGreaterThan(nowhere.score)
    expect(postcodeBandFor('3220', '3220', config().postcodeBands)?.label).toBe('the same postcode')
    expect(postcodeBandFor('3250', '3220', config().postcodeBands)?.label).toBe('the same postal district')
    expect(postcodeBandFor(null, '3220', config().postcodeBands)).toBeNull()
  })

  it('price_inside_band_tolerance_beats_outside', () => {
    // 4500 cents is the 30-to-59 band. A buyer one band away is inside a
    // tolerance of one; four bands away is outside it.
    expect(priceFit('30-to-59', '30-to-59', 1)).toBe(1)
    expect(priceFit('under-30', '30-to-59', 1)).toBe(0.5)
    expect(priceFit('200-plus', '30-to-59', 1)).toBe(0)
    expect(priceFit('unknown', '30-to-59', 5)).toBe(0)

    const inside = scoreAudienceMember(member({ priceBand: 'under-30' }), event(), config(), ask)
    const outside = scoreAudienceMember(member({ priceBand: '200-plus' }), event(), config(), ask)
    expect(inside.score).toBeGreaterThan(outside.score)
  })

  it('recency_decays_by_configured_half_life_exactly', () => {
    const halfLife = 120
    const oneHalfLifeAgo = new Date(NOW.getTime() - halfLife * 86_400_000).toISOString()
    const twoHalfLivesAgo = new Date(NOW.getTime() - 2 * halfLife * 86_400_000).toISOString()
    expect(recencyFit(NOW.toISOString(), NOW, halfLife)).toBe(1)
    expect(recencyFit(oneHalfLifeAgo, NOW, halfLife)).toBeCloseTo(0.5, 6)
    expect(recencyFit(twoHalfLivesAgo, NOW, halfLife)).toBeCloseTo(0.25, 6)
    expect(recencyFit(null, NOW, halfLife)).toBe(0)

    // And the half life is CONFIGURATION: double it and the same purchase
    // scores as though it were half as old.
    expect(recencyFit(oneHalfLifeAgo, NOW, halfLife * 2)).toBeCloseTo(Math.pow(0.5, 0.5), 6)
  })

  it('lifetime_spend_band_raises_score_monotonically', () => {
    const spends = [0, 5_000, 20_000, 50_000, 200_000]
    const scores = spends.map(
      cents => scoreAudienceMember(member({ lifetimeSpendCents: cents }), event(), config(), ask).score,
    )
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]!)
    }
    // And it flattens rather than running away: past the ceiling more spend
    // stops meaning more intent.
    expect(spendFit(50_000)).toBe(1)
    expect(spendFit(500_000)).toBe(1)
    expect(spendFit(0)).toBe(0)
  })

  it('missing_channel_consent_zeroes_that_component', () => {
    const withConsent = scoreAudienceMember(member({ consentChannel: 'email' }), event(), config(), ask)
    const smsOnly = scoreAudienceMember(member({ consentChannel: 'sms' }), event(), config(), ask)
    const none = scoreAudienceMember(member({ consentChannel: null }), event(), config(), ask)

    const componentOf = (v: typeof withConsent) =>
      v.breakdown.find(entry => entry.component === 'channel_consent')!
    expect(componentOf(withConsent).contribution).toBeCloseTo(10, 6)
    expect(componentOf(smsOnly).contribution).toBe(0)
    expect(componentOf(none).contribution).toBe(0)
    // Only that component: the rest of the score is untouched.
    expect(withConsent.score - none.score).toBeCloseTo(10, 6)
  })

  it('weights_not_summing_to_one_raises_named_error', () => {
    const broken = config({
      weights: config().weights.map(w => (w.component === 'category' ? { ...w, weight: 0.5 } : w)),
    })
    expect(() => assertWeightsAreUsable(broken)).toThrowError(MatchConfigError)
    try {
      assertWeightsAreUsable(broken)
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('marketing_match_weights sums to')
      expect(message).toContain('category=0.5')
    }

    const outOfRange = config({
      weights: config().weights.map(w => (w.component === 'city' ? { ...w, weight: 1.5 } : w)),
    })
    expect(() => assertWeightsAreUsable(outOfRange)).toThrowError(/row "city" carries the weight 1.5/)
    expect(() => assertWeightsAreUsable(config({ weights: [] }))).toThrowError(/is empty/)
  })

  it('score_is_bounded_0_to_100_on_fuzzed_input', () => {
    const bands = ['unknown', 'free', 'under-30', '30-to-59', '60-to-99', '100-to-199', '200-plus'] as const
    let checked = 0
    for (let i = 0; i < 500; i += 1) {
      const pseudo = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280
      const verdict = scoreAudienceMember(
        member({
          categorySlugs: pseudo(1) > 0.5 ? ['music'] : [],
          communitySlugs: pseudo(2) > 0.5 ? ['greek'] : ['nothing-like-it'],
          citySlugs: pseudo(3) > 0.5 ? ['geelong'] : [],
          postcode: pseudo(4) > 0.5 ? '3220' : null,
          priceBand: bands[Math.floor(pseudo(5) * bands.length)]!,
          lastOrderAt:
            pseudo(6) > 0.2
              ? new Date(NOW.getTime() - Math.floor(pseudo(7) * 4000) * 86_400_000).toISOString()
              : null,
          lifetimeSpendCents: Math.floor(pseudo(8) * 1_000_000) - 5_000,
          consentChannel: pseudo(9) > 0.5 ? 'both' : null,
        }),
        event({ medianTierPriceCents: Math.floor(pseudo(10) * 40_000) - 1000 }),
        config(),
        ask,
      )
      expect(verdict.score).toBeGreaterThanOrEqual(0)
      expect(verdict.score).toBeLessThanOrEqual(100)
      checked += 1
    }
    expect(checked).toBe(500)
  })

  it('breakdown_contributions_sum_to_score', () => {
    const verdict = scoreAudienceMember(member(), event(), config(), ask)
    const summed = verdict.breakdown.reduce((sum, entry) => sum + entry.contribution, 0)
    expect(summed).toBeCloseTo(verdict.score, 1)
    expect(verdict.breakdown.map(e => e.component)).toEqual([...MATCH_COMPONENTS])
    // Every component explains itself: a sentence and what it actually saw.
    for (const entry of verdict.breakdown) {
      expect(entry.sentence.length).toBeGreaterThan(10)
      expect(entry.raw.length).toBeGreaterThan(3)
    }
  })

  it('a perfect match scores 100 and a buyer with no history at all scores zero', () => {
    const perfect = scoreAudienceMember(
      member({ lastOrderAt: NOW.toISOString(), lifetimeSpendCents: 100_000 }),
      event(),
      config(),
      ask,
    )
    expect(perfect.score).toBeCloseTo(100, 1)

    const stranger = scoreAudienceMember(
      member({
        categorySlugs: [],
        communitySlugs: [],
        citySlugs: [],
        postcode: null,
        priceBand: 'unknown',
        lastOrderAt: null,
        lifetimeSpendCents: 0,
        consentChannel: null,
      }),
      event(),
      config(),
      ask,
    )
    expect(stranger.score).toBe(0)
  })

  it('the method sentence names every weight, so the screen cannot describe a method it is not running', () => {
    const sentence = methodSentence(config())
    for (const component of MATCH_COMPONENTS) {
      expect(sentence).toContain(component.replace('_', ' '))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA2: suppression happens first, and every removal says why', () => {
  const facts = {
    consentPermitted: true,
    unsubscribed: false,
    holdsTicket: false,
    lastSentAt: null,
    bouncedOrComplained: false,
  }
  const options = { now: NOW, cooldownDays: 14 }

  it('consent_false_is_suppressed_with_reason', () => {
    expect(suppressionReasonFor({ ...facts, consentPermitted: false }, options)).toBe('consent_not_live')
    expect(SUPPRESSION_SENTENCES.consent_not_live).toContain('does not currently permit')
  })

  it('unsubscribed_is_suppressed_with_reason', () => {
    expect(suppressionReasonFor({ ...facts, unsubscribed: true }, options)).toBe('unsubscribed')
    expect(SUPPRESSION_SENTENCES.unsubscribed).toContain('unsubscribed')
  })

  it('existing_ticket_holder_for_this_event_is_suppressed', () => {
    expect(suppressionReasonFor({ ...facts, holdsTicket: true }, options)).toBe('already_holds_a_ticket')
  })

  it('inside_cooldown_is_suppressed', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000).toISOString()
    const twentyDaysAgo = new Date(NOW.getTime() - 20 * 86_400_000).toISOString()
    expect(suppressionReasonFor({ ...facts, lastSentAt: twoDaysAgo }, options)).toBe('inside_send_cooldown')
    expect(suppressionReasonFor({ ...facts, lastSentAt: twentyDaysAgo }, options)).toBeNull()
    // And the cooldown is configuration: widen it and the same send suppresses.
    expect(
      suppressionReasonFor({ ...facts, lastSentAt: twentyDaysAgo }, { ...options, cooldownDays: 30 }),
    ).toBe('inside_send_cooldown')
  })

  it('below_minimum_floor_is_suppressed', () => {
    expect(isBelowFloor(19.9, 20)).toBe(true)
    expect(isBelowFloor(20, 20)).toBe(false)

    const composed = composeRun(
      [member({ id: 'a', categorySlugs: [], communitySlugs: [], citySlugs: [], postcode: null, priceBand: 'unknown', lastOrderAt: null, lifetimeSpendCents: 0, consentChannel: null })],
      event(),
      config(),
      () => facts,
      { now: NOW, channel: 'email', cap: 10 },
    )
    expect(composed.ranked).toHaveLength(0)
    expect(composed.funnel.below_minimum_score).toBe(1)
  })

  it('suppressed_person_never_appears_in_scores', () => {
    const composed = composeRun(
      [member({ id: 'aaa' }), member({ id: 'bbb', email: 'gone@example.test' })],
      event(),
      config(),
      m => (m.id === 'bbb' ? { ...facts, consentPermitted: false } : facts),
      { now: NOW, channel: 'email', cap: 10 },
    )
    expect(composed.ranked.map(r => r.member.id)).toEqual(['aaa'])
    expect(composed.funnel.consent_not_live).toBe(1)
    expect(composed.considered).toBe(2)
  })

  it('every reason appears in the funnel even at zero, so the screen never drops one', () => {
    const funnel = emptyFunnel()
    for (const reason of SUPPRESSION_REASONS) expect(funnel[reason]).toBe(0)
    expect(Object.keys(SUPPRESSION_SENTENCES).sort()).toEqual([...SUPPRESSION_REASONS].sort())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA2: the run is ranked, capped and reproducible', () => {
  function population(n: number): AudienceRowForScoring[] {
    return Array.from({ length: n }, (_, i) =>
      member({
        id: `member-${String(i).padStart(4, '0')}`,
        email: `lane-b-${i}@example.test`,
        categorySlugs: i % 2 === 0 ? ['music'] : ['comedy'],
        citySlugs: i % 3 === 0 ? ['geelong'] : ['darwin'],
        lifetimeSpendCents: 1000 * (i % 40),
      }),
    )
  }

  it('caps the list and records that it was cut', () => {
    const composed = composeRun(population(500), event(), config(), () => ({
      consentPermitted: true,
      unsubscribed: false,
      holdsTicket: false,
      lastSentAt: null,
      bouncedOrComplained: false,
    }), { now: NOW, channel: 'email', cap: 50 })

    expect(composed.considered).toBe(500)
    expect(composed.ranked).toHaveLength(50)
    expect(composed.truncated).toBe(true)
    expect(composed.ranked.map(r => r.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(new Set(composed.ranked.map(r => r.member.id)).size).toBe(50)
  })

  it('ranks the same way twice, because the tie break is written down', () => {
    const people = population(80)
    const facts = () => ({
      consentPermitted: true,
      unsubscribed: false,
      holdsTicket: false,
      lastSentAt: null,
      bouncedOrComplained: false,
    })
    const first = composeRun(people, event(), config(), facts, { now: NOW, channel: 'email', cap: 30 })
    const second = composeRun([...people].reverse(), event(), config(), facts, { now: NOW, channel: 'email', cap: 30 })
    expect(first.ranked.map(r => r.member.id)).toEqual(second.ranked.map(r => r.member.id))
  })

  it('a weight change moves the ranking, which is what makes it configuration', () => {
    const people = population(60)
    const facts = () => ({
      consentPermitted: true,
      unsubscribed: false,
      holdsTicket: false,
      lastSentAt: null,
      bouncedOrComplained: false,
    })
    const asIs = composeRun(people, event(), config(), facts, { now: NOW, channel: 'email', cap: 20 })

    // Move the weight from category to city and keep the sum at one.
    const moved = config({
      weights: config().weights.map(w => {
        if (w.component === 'category') return { ...w, weight: 0.04 }
        if (w.component === 'city') return { ...w, weight: 0.34 }
        return w
      }),
    })
    const after = composeRun(people, event(), moved, facts, { now: NOW, channel: 'email', cap: 20 })
    expect(after.ranked.map(r => r.member.id)).not.toEqual(asIs.ranked.map(r => r.member.id))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA2: the schema holds the invariant, and nothing in this item sends', () => {
  it('the database refuses a score row for somebody the resolver refuses', () => {
    expect(migration).toContain('before insert on public.marketing_match_score')
    expect(migration).toContain('public.match_score_requires_live_consent()')
    expect(migration).toContain('public.audience_consent_is_live(v_email)')
  })

  it('the database refuses a run that holds more rows than its own cap', () => {
    expect(migration).toContain('already holds % row(s) and its cap is %')
  })

  it('the invariant is also readable, so a guard and a person read one definition', () => {
    expect(migration).toContain('create or replace view public.marketing_match_invariant_breaches')
  })

  it('every number the matcher uses is a row rather than a literal', () => {
    for (const table of [
      'public.marketing_match_config',
      'public.marketing_match_weights',
      'public.marketing_match_postcode_bands',
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`)
    }
  })

  it('no file this item added imports a transport, mail, SMS or notification module', () => {
    const OWN_FILES = [
      'src/lib/matching/score.ts',
      'src/lib/matching/suppress.ts',
      'src/lib/matching/compose.ts',
      'src/lib/matching/config.ts',
      'src/lib/matching/run.ts',
      'src/app/admin/(authed)/matches/page.tsx',
      'src/app/admin/(authed)/matches/actions.ts',
      'src/app/admin/(authed)/matches/match-run-form.tsx',
    ]
    const TRANSPORTS = [
      /from '@\/lib\/email\/send'/,
      /from 'resend'/,
      /from 'twilio'/,
      /from '@\/lib\/notifications\//,
      /sendEmail\s*\(/,
      /sendWebPush\s*\(/,
    ]
    for (const file of OWN_FILES) {
      expect(existsSync(join(ROOT, file)), `${file} is missing`).toBe(true)
      const source = readFileSync(join(ROOT, file), 'utf8')
      for (const re of TRANSPORTS) {
        expect(re.test(source), `${file} can reach a transport and this item sends nothing`).toBe(false)
      }
    }
  })

  it('the whole matching directory is free of transports, not just the files listed', () => {
    // The negative control for the list above: a ninth file added tomorrow is
    // covered without anybody remembering to add it here.
    const dir = join(ROOT, 'src', 'lib', 'matching')
    const files = readdirSync(dir).filter(f => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(/from '@\/lib\/email\/send'|from 'resend'|sendEmail\s*\(/.test(source), `${file} reaches a transport`).toBe(false)
    }
  })
})
