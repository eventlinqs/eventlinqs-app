/**
 * offer-is-one-rule (LAW 24 as ruled, 26 September 2026): the judgements a text
 * drill cannot reach. A spreadsheet cell cannot be planted by find-and-replace,
 * so the cell wording that shipped in docs/marketing/eventlinqs-outreach-tracker.xlsx
 * until that day is judged here directly, together with the word forms of the
 * month figures and the module read itself.
 */
import { describe, expect, it } from 'vitest'
import { judgeUnit, readModule, PHRASES, REGISTER } from '../../../scripts/guards/offer-is-one-rule.mjs'
import { FOUNDING_INITIAL_MONTHS, FOUNDING_REFERRAL_MONTHS, FOUNDING_BADGE_NAME, FOUNDING_OFFER_SCOPE } from '@/lib/payments/founding-waiver'

const TERMS = { initial: FOUNDING_INITIAL_MONTHS, referral: FOUNDING_REFERRAL_MONTHS }
const rules = (text: string, kind: 'rendered' | 'static' = 'static') => judgeUnit({ text }, TERMS, kind).map(f => f.rule)

describe('the module the guard reads is the module the product imports', () => {
  it('reads the same four values the code does', () => {
    const read = readModule(process.cwd())
    expect(read).toEqual({
      initial: FOUNDING_INITIAL_MONTHS,
      referral: FOUNDING_REFERRAL_MONTHS,
      badge: FOUNDING_BADGE_NAME,
      scope: FOUNDING_OFFER_SCOPE,
      hasTerms: true,
    })
  })
})

describe('the spreadsheet wording that shipped until 26 September 2026 fails', () => {
  it('"first 50 only" in the one-offer rule', () => {
    expect(rules('One offer, one wording: zero platform fees for 6 months, extendable 3 months per successful referral, first 50 only.')).toContain('first-50')
  })

  it('the founding-spots counter labels', () => {
    expect(rules('Total founding spots')).toContain('founding-spots')
    expect(rules('Spots remaining on the founding offer')).toContain('spots-left')
  })

  it('and the rewritten cell passes', () => {
    expect(
      rules(
        'One offer, one wording (LAW 24 as ruled, 26 September 2026): every organiser gets zero platform fees for 6 months from the day they register, no cap, no limit on places, no invitation needed, plus 3 more fee-free months for each organiser they refer who sells a ticket. Then the standard fee. Every organiser is a Founding Organiser.',
      ),
    ).toEqual([])
  })
})

describe('month figures', () => {
  it('a document that says a different number fails, in digits or in words', () => {
    expect(rules('Every organiser pays zero platform fees for 12 months.')).toContain('initial-months-disagree')
    expect(rules('Every organiser gets twelve months fee-free.')).toContain('initial-months-disagree')
    expect(rules('Each referral adds 2 months to your fee-free window.')).toContain('referral-months-disagree')
    expect(rules('four more fee-free months for each organiser you refer')).toContain('referral-months-disagree')
  })

  it('a document that says the module numbers passes', () => {
    expect(rules('Every organiser gets six months fee-free, plus three more fee-free months per referral.')).toEqual([])
  })

  it('on a rendered surface ANY typed figure fails, even the right one', () => {
    expect(rules("'6 months completely fee-free on every paid ticket'", 'rendered')).toContain('typed-month-claim')
    expect(rules('`${FOUNDING_INITIAL_MONTHS} months completely fee-free`', 'rendered')).toEqual([])
  })

  it('a month figure outside the offer context is not the offer', () => {
    expect(rules('Technical logs: generally up to 12 months.')).toEqual([])
  })
})

describe('the phrase list and the two cities', () => {
  it('holds every phrase the ruling names', () => {
    const ids = PHRASES.map(p => p.id)
    for (const id of ['first-50', '50-founding', 'founding-spots', 'limited-places', 'limited-spots', 'spots-left', 'invite-only', 'by-invitation', 'invitation-only', 'first-come']) {
      expect(ids).toContain(id)
    }
  })

  it('Geelong and Melbourne as a limit fails; as where the founder recruits it does not', () => {
    expect(rules('EventLinqs launches in Geelong and Melbourne with the founding offer.')).toContain('geelong-and-melbourne')
    expect(rules('Ticketing built for local events. Geelong + Melbourne first.')).toContain('geelong-and-melbourne')
    expect(rules('RECRUITMENT and SEEDING effort goes to one wedge where Lawal has real reach: the Geelong and Melbourne music and community scenes.')).toEqual([])
  })

  it('every register entry carries a reason and an exact count', () => {
    for (const entry of REGISTER) {
      expect(entry.reason.length).toBeGreaterThan(40)
      expect(Number.isInteger(entry.count) && entry.count > 0).toBe(true)
    }
  })
})
