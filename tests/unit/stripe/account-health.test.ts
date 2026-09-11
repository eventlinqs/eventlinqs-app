import { describe, it, expect } from 'vitest'
import {
  assessAllAccounts,
  assessConnectedAccount,
  DEADLINE_AMBER_DAYS,
  descriptorMatchesTradingName,
  listAllConnectedAccounts,
  MAX_ACCOUNT_PAGES,
  PENDING_VERIFICATION_AMBER_DAYS,
  STRIPE_LIST_LIMIT,
  worseOf,
  type ConnectedAccountFacts,
} from '@/lib/stripe/account-health'

/**
 * CONNECTED ACCOUNT HEALTH. Close-out S1's severity rules, asserted exactly.
 *
 *   "- RED if any account has charges_enabled false, or payouts_enabled false,
 *      or a disabled_reason set, or anything in past_due.
 *    - AMBER if anything is in currently_due, or a current_deadline falls
 *      inside 14 days, or anything sits in pending_verification for more than
 *      3 days.
 *    - GREEN only when every account can take charges, can be paid out, and has
 *      nothing currently due."
 *
 * The ONE narrowing is the never-onboarded account, and it has its own block
 * below with the measurement that forced it. Everything else here is the rule as
 * written.
 */

const NOW = Date.parse('2026-09-11T00:00:00.000Z')
const inDays = (n: number) => Math.floor((NOW + n * 86_400_000) / 1000)

/** A fully onboarded, entirely healthy account. Every case below is this with
 *  one thing changed, so a test can never pass for a reason it did not name. */
function healthy(over: Partial<ConnectedAccountFacts> = {}): ConnectedAccountFacts {
  return {
    id: 'acct_HEALTHY',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    business_profile: { name: 'Basement 45' },
    settings: { payments: { statement_descriptor: 'BASEMENT 45' }, card_payments: { statement_descriptor_prefix: 'Basement' } },
    requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [], current_deadline: null },
    future_requirements: { currently_due: [], current_deadline: null },
    ...over,
  }
}

const OWNER = [{ id: 'org-1', name: 'Basement 45' }]
const assess = (a: ConnectedAccountFacts, owners = OWNER, ages?: Map<string, number>) =>
  assessConnectedAccount(a, owners, { now: NOW, pendingVerificationAges: ages })

describe('GREEN only when everything works', () => {
  it('is green when the account can charge, can be paid out, and owes nothing', () => {
    const r = assess(healthy())
    expect(r.verdict).toBe('green')
    expect(r.findings).toEqual([])
  })

  it('is still green with an empty future_requirements and a null deadline', () => {
    expect(assess(healthy({ future_requirements: { currently_due: [], current_deadline: null } })).verdict).toBe('green')
  })

  it('is green when requirements is absent entirely, rather than guessing', () => {
    expect(assess(healthy({ requirements: null, future_requirements: null })).verdict).toBe('green')
  })
})

describe('RED: money could move and now cannot', () => {
  it('charges_enabled false', () => {
    const r = assess(healthy({ charges_enabled: false }))
    expect(r.verdict).toBe('red')
    expect(r.findings.join(' ')).toContain('cannot take charges')
  })

  it('payouts_enabled false', () => {
    const r = assess(healthy({ payouts_enabled: false }))
    expect(r.verdict).toBe('red')
    expect(r.findings.join(' ')).toContain('cannot be paid out')
  })

  it('a disabled_reason set', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, disabled_reason: 'rejected.fraud' } }))
    expect(r.verdict).toBe('red')
    expect(r.findings.join(' ')).toContain('rejected.fraud')
  })

  it('anything in past_due', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, past_due: ['external_account'] } }))
    expect(r.verdict).toBe('red')
    expect(r.findings.join(' ')).toContain('external_account')
  })

  it('names the requirements rather than only counting them', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, past_due: ['company.tax_id', 'external_account'] } }))
    expect(r.findings.join(' ')).toContain('company.tax_id, external_account')
  })

  it('caps a very long list and says how many it hid, so one account cannot flood the email', () => {
    const many = Array.from({ length: 57 }, (_, i) => `requirement.${i}`)
    const r = assess(healthy({ requirements: { ...healthy().requirements, past_due: many } }))
    const line = r.findings.join(' ')
    expect(line).toContain('requirement.0')
    expect(line).toContain('(+49 more)')
    expect(line).not.toContain('requirement.56')
  })
})

describe('AMBER: working today, with something that will stop it', () => {
  it('anything in currently_due', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, currently_due: ['individual.verification.document'] } }))
    expect(r.verdict).toBe('amber')
    expect(r.findings.join(' ')).toContain('individual.verification.document')
  })

  it('a current_deadline inside 14 days', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, current_deadline: inDays(DEADLINE_AMBER_DAYS - 1) } }))
    expect(r.verdict).toBe('amber')
  })

  it('a current_deadline beyond 14 days is not a warning', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, current_deadline: inDays(DEADLINE_AMBER_DAYS + 1) } }))
    expect(r.verdict).toBe('green')
  })

  it('the boundary itself is inside, because "falls inside 14 days" includes the fourteenth', () => {
    expect(assess(healthy({ requirements: { ...healthy().requirements, current_deadline: inDays(DEADLINE_AMBER_DAYS) } })).verdict).toBe('amber')
  })

  it('a deadline already passed reports how long ago, not a negative countdown', () => {
    const r = assess(healthy({ requirements: { ...healthy().requirements, current_deadline: inDays(-3) } }))
    expect(r.findings.join(' ')).toContain('passed its Stripe deadline 3 day(s) ago')
  })
})

describe('pending_verification is only a finding once it is STUCK', () => {
  const pending = healthy({
    requirements: { ...healthy().requirements, pending_verification: ['individual.verification.document'] },
  })

  it('is green on the first sighting, because Stripe reading a document is the ordinary state', () => {
    expect(assess(pending).verdict).toBe('green')
  })

  it('is still green at exactly three days, because the rule says MORE than three', () => {
    const ages = new Map([['individual.verification.document', PENDING_VERIFICATION_AMBER_DAYS]])
    expect(assess(pending, OWNER, ages).verdict).toBe('green')
  })

  it('turns amber past three days and says how long', () => {
    const ages = new Map([['individual.verification.document', 9]])
    const r = assess(pending, OWNER, ages)
    expect(r.verdict).toBe('amber')
    expect(r.findings.join(' ')).toContain('more than 3 days')
    expect(r.actions.join(' ')).toContain('9 days')
  })

  it('an unknown age is treated as new, so a database that cannot answer never manufactures a warning', () => {
    expect(assess(pending, OWNER, new Map()).verdict).toBe('green')
  })
})

/**
 * THE ONE NARROWING OF S1'S EXACT RULES, AND THE ACCOUNT THAT FORCED IT.
 *
 * Measured on TEST: organisation "Thunderbird Freight Sessions",
 * acct_1U2EYNGsSxcPFPRu, charges_enabled false, payouts_enabled false,
 * disabled_reason "requirements.past_due" and 57 entries in past_due including
 * tos_acceptance.date and external_account. Somebody pressed "set up payouts"
 * and walked away before entering anything.
 *
 * Under the literal rule that is RED on four counts, RED maps to 'critical', and
 * critical emails the owner every thirty minutes for ever. That is the same
 * defect S1 exists to delete, wearing new clothes.
 *
 * Stripe publishes the field that separates the two cases: details_submitted,
 * "Accounts where this is false should be directed to an onboarding flow to
 * finish submitting account details."
 * (https://docs.stripe.com/api/accounts/object, fetched 2026-09-11)
 */
describe('an account that never finished onboarding is AMBER and never RED', () => {
  const thunderbird = healthy({
    id: 'acct_1U2EYNGsSxcPFPRu',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements: {
      disabled_reason: 'requirements.past_due',
      currently_due: ['tos_acceptance.date', 'external_account'],
      past_due: ['tos_acceptance.date', 'external_account'],
      pending_verification: [],
      current_deadline: null,
    },
  })
  const owners = [{ id: 'org-t', name: 'Thunderbird Freight Sessions' }]

  it('does not wake anybody', () => {
    expect(assess(thunderbird, owners).verdict).toBe('amber')
  })

  it('says plainly that nothing is broken', () => {
    const r = assess(thunderbird, owners)
    expect(r.findings.join(' ')).toContain('has never finished Stripe onboarding')
    expect(r.actions.join(' ')).toContain('Nothing is broken')
  })

  it('does not recite fifty-seven past_due fields at somebody who typed nothing', () => {
    const r = assess(thunderbird, owners)
    expect(r.findings.join(' ')).not.toContain('tos_acceptance.date')
    expect(r.findings).toHaveLength(1)
  })

  it('names the organiser and the account, so the owner can act on the line', () => {
    const line = assess(thunderbird, owners).findings.join(' ')
    expect(line).toContain('Thunderbird Freight Sessions')
    expect(line).toContain('acct_1U2EYNGsSxcPFPRu')
  })

  it('an account that DID finish and then broke is still RED, which is the whole point of the narrowing', () => {
    expect(assess(healthy({ charges_enabled: false, details_submitted: true }), owners).verdict).toBe('red')
  })
})

describe('the fault that survived the deletion: one account, several organisations', () => {
  const owners = [
    { id: 'a', name: 'Basement 45' },
    { id: 'b', name: 'Rooftop Collective' },
    { id: 'c', name: 'Thunderbird' },
  ]

  it('is RED, because their money settles into one Stripe account', () => {
    const r = assess(healthy(), owners)
    expect(r.verdict).toBe('red')
    expect(r.findings.join(' ')).toContain('claimed by 3 organisations')
  })

  it('reports it once, not once per organisation', () => {
    const r = assess(healthy(), owners)
    expect(r.findings.filter(f => f.includes('claimed by')).length).toBe(1)
  })
})

describe('the statement descriptor clause never overstates what is true here', () => {
  const wrong = healthy({
    business_profile: { name: 'Basement 45' },
    settings: { payments: { statement_descriptor: 'EVENTLINQS.COM' }, card_payments: { statement_descriptor_prefix: null } },
  })

  it('is amber, never red', () => {
    expect(assess(wrong).verdict).toBe('amber')
  })

  it('does not claim a buyer sees it, because on this charge type no buyer does', () => {
    const action = assess(wrong).actions.join(' ')
    expect(action).toContain('charged on the platform account')
    expect(action).toContain('not on their statements today')
  })

  it('does not fire on a descriptor Stripe merely uppercased and truncated', () => {
    expect(descriptorMatchesTradingName('BASEMENT 45', 'Basement 45')).toBe(true)
    expect(descriptorMatchesTradingName('BASEMENT 45 COLLECT', 'Basement 45 Collective')).toBe(true)
    expect(descriptorMatchesTradingName('EVENTLINQS.COM', 'Basement 45')).toBe(false)
  })

  it('says nothing when either side is unset, rather than guessing', () => {
    expect(assess(healthy({ settings: { payments: { statement_descriptor: null }, card_payments: null } })).verdict).toBe('green')
    expect(assess(healthy({ business_profile: { name: null } })).verdict).toBe('green')
  })
})

describe('rolling up many accounts', () => {
  it('the worst verdict wins, so one broken account is never averaged away', () => {
    expect(worseOf('green', 'red')).toBe('red')
    expect(worseOf('amber', 'red')).toBe('red')
    expect(worseOf('green', 'amber')).toBe('amber')
    expect(worseOf('green', 'green')).toBe('green')
  })

  it('reports red accounts before amber ones, so a daily email reads top down', () => {
    const rolled = assessAllAccounts([
      assess(healthy({ id: 'acct_AMBER', requirements: { ...healthy().requirements, currently_due: ['x'] } })),
      assess(healthy({ id: 'acct_RED', charges_enabled: false })),
    ])
    expect(rolled.verdict).toBe('red')
    expect(rolled.findings[0]).toContain('cannot take charges')
  })

  it('counts how many are fully healthy, so a green number is visible beside the faults', () => {
    const rolled = assessAllAccounts([assess(healthy()), assess(healthy({ id: 'acct_2', charges_enabled: false }))])
    expect(rolled.assessed).toBe(2)
    expect(rolled.green).toBe(1)
  })

  it('keeps one NAMED action per organiser, because the owner needs to know which three', () => {
    const broken = (id: string) => assess(healthy({ id, payouts_enabled: false }), [{ id, name: id }])
    const rolled = assessAllAccounts([broken('acct_1'), broken('acct_2'), broken('acct_3')])
    expect(rolled.actions).toHaveLength(3)
    for (const id of ['acct_1', 'acct_2', 'acct_3']) {
      expect(rolled.actions.some(a => a.includes(id)), `no action names ${id}`).toBe(true)
    }
  })

  it('does not print the identical sentence twice', () => {
    const one = assess(healthy({ id: 'acct_1', payouts_enabled: false }), [{ id: 'a', name: 'Basement 45' }])
    const rolled = assessAllAccounts([one, one])
    expect(rolled.actions).toHaveLength(1)
  })
})

/**
 * PAGING, BECAUSE S1 SAYS "DO NOT SAMPLE".
 *
 * The reversal condition: "If Stripe rate limits the account list, page it and
 * report the page count, do not sample."
 *
 * The check this replaced fetched `/v1/accounts?limit=100` once and stopped, and
 * the first draft of the replacement inherited that line unchanged. Stripe caps
 * `limit` at 100 and pages forward with `starting_after`, ending when `has_more`
 * is false (https://docs.stripe.com/api/pagination, fetched 2026-09-11). So on
 * the 101st connected organiser the check would have gone on reporting green
 * with an unknown number of accounts never looked at, and nothing would have
 * said so. A monitor that silently stops looking is worse than none, because its
 * silence reads as health.
 *
 * The fetcher is injected, so these test THIS LOOP rather than claim anything
 * about Stripe. The shape being paged against is quoted from Stripe's own page.
 */
describe('listAllConnectedAccounts', () => {
  const page = (ids: string[], has_more = false) => ({ data: ids.map(id => ({ id })), has_more })

  it('reads a single page and reports one page', async () => {
    const r = await listAllConnectedAccounts(async () => page(['acct_1', 'acct_2']))
    expect(r.accounts.map(a => a.id)).toEqual(['acct_1', 'acct_2'])
    expect(r.pages).toBe(1)
    expect(r.truncated).toBe(false)
  })

  it('follows has_more to the end and reports every page', async () => {
    const pages = [page(['acct_1', 'acct_2'], true), page(['acct_3', 'acct_4'], true), page(['acct_5'])]
    let n = 0
    const r = await listAllConnectedAccounts(async () => pages[n++])
    expect(r.accounts.map(a => a.id)).toEqual(['acct_1', 'acct_2', 'acct_3', 'acct_4', 'acct_5'])
    expect(r.pages).toBe(3)
    expect(r.truncated).toBe(false)
  })

  it('passes the LAST id of the page as the next cursor, which is what starting_after means', async () => {
    const cursors: (string | null)[] = []
    const pages = [page(['acct_1', 'acct_2'], true), page(['acct_3'])]
    let n = 0
    await listAllConnectedAccounts(async (startingAfter) => {
      cursors.push(startingAfter)
      return pages[n++]
    })
    expect(cursors).toEqual([null, 'acct_2'])
  })

  it('stops on an empty page even when Stripe still says has_more, rather than spinning', async () => {
    const r = await listAllConnectedAccounts(async () => page([], true))
    expect(r.pages).toBe(1)
    expect(r.truncated).toBe(false)
  })

  it('reports truncation rather than sampling silently when the cap is reached', async () => {
    let i = 0
    const r = await listAllConnectedAccounts(async () => page([`acct_${i++}`], true))
    expect(r.truncated).toBe(true)
    expect(r.pages).toBe(MAX_ACCOUNT_PAGES)
  })

  it('never asks Stripe for more than Stripe allows', () => {
    expect(STRIPE_LIST_LIMIT).toBeLessThanOrEqual(100)
    expect(STRIPE_LIST_LIMIT).toBeGreaterThanOrEqual(1)
  })

  it('drops a malformed row rather than assessing an account with no id', async () => {
    const r = await listAllConnectedAccounts(async () => ({
      data: [{ id: 'acct_1' }, null as never, { charges_enabled: true } as never],
      has_more: false,
    }))
    expect(r.accounts.map(a => a.id)).toEqual(['acct_1'])
  })
})
