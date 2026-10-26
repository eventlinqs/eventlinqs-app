import { describe, expect, test } from 'vitest'
import { parsePlatformPageRequest, platformSecretFor, isPlatformScope, PLATFORM_SECRET_ENV } from '@/lib/connect/bookedproof/platform-request'
import { standingBookedproofConsent, firstNameOf, readOrganisationsPage } from '@/lib/connect/bookedproof/platform-read'
import { readsSentence, totalReads, emptyTotals } from '@/lib/connect/bookedproof/platform-log'

/**
 * T3, THE PLATFORM READ'S RULES: the page body, one secret per scope, the
 * consent that lets a buyer leave EventLinqs (only a standing grant whose own
 * wording names Bookedproof), the allow-list of what an organisation row
 * carries, and the owner's one sentence.
 */

describe('the page body', () => {
  test('an empty body is the first page at the default size', () => {
    expect(parsePlatformPageRequest('')).toEqual({ ok: true, value: { after: null, limit: 200 } })
  })
  test('a cursor and a limit are taken as sent', () => {
    expect(parsePlatformPageRequest('{"after":"buyer@example.com","limit":50}')).toEqual({ ok: true, value: { after: 'buyer@example.com', limit: 50 } })
  })
  test('anything else is refused with its reason', () => {
    expect(parsePlatformPageRequest('{"since":"2026-10-01"}')).toEqual({ ok: false, reason: 'unknown field(s): since' })
    expect(parsePlatformPageRequest('{"after":"a b"}')).toEqual({ ok: false, reason: 'after must be the last key of the page before, or null' })
    expect(parsePlatformPageRequest('{"limit":0}').ok).toBe(false)
    expect(parsePlatformPageRequest('[]')).toEqual({ ok: false, reason: 'the body is not an object' })
    expect(parsePlatformPageRequest('{')).toEqual({ ok: false, reason: 'the body is not JSON' })
  })
})

describe('one secret per scope', () => {
  test('each scope reads only its own variable', () => {
    const env = { BOOKEDPROOF_PLATFORM_SECRET_LEDGER: ' x ' } as unknown as NodeJS.ProcessEnv
    expect(platformSecretFor('ledger', env)).toBe('x')
    expect(platformSecretFor('buyers', env)).toBeNull()
    expect(new Set(Object.values(PLATFORM_SECRET_ENV)).size).toBe(4)
  })
  test('only the four scopes exist', () => {
    expect(['organisations', 'events', 'buyers', 'ledger'].every(isPlatformScope)).toBe(true)
    expect(isPlatformScope('profiles')).toBe(false)
  })
})

describe('the consent that lets a buyer leave', () => {
  const v2 = 'You agree EventLinqs and Bookedproof may tell you about events'
  const v1 = 'You agree EventLinqs may tell you about events by other organisers'
  test('a standing grant under wording that names Bookedproof counts', () => {
    expect(standingBookedproofConsent([{ decision: 'granted', wording: v2, wording_version: 'v2', occurred_at: '2026-10-01T00:00:00Z' }])).toEqual({
      occurred_at: '2026-10-01T00:00:00Z',
      wording_version: 'v2',
      wording: v2,
    })
  })
  test('a grant under wording that does not name Bookedproof does not', () => {
    expect(standingBookedproofConsent([{ decision: 'granted', wording: v1, wording_version: 'v1', occurred_at: '2026-10-01T00:00:00Z' }])).toBeNull()
  })
  test('a later withdrawal or decline ends it, whatever came before', () => {
    expect(
      standingBookedproofConsent([
        { decision: 'granted', wording: v2, wording_version: 'v2', occurred_at: '2026-10-01T00:00:00Z' },
        { decision: 'withdrawn', wording: v2, wording_version: 'v2', occurred_at: '2026-10-05T00:00:00Z' },
      ]),
    ).toBeNull()
  })
  test('the newest event decides, in any order given', () => {
    expect(
      standingBookedproofConsent([
        { decision: 'granted', wording: v2, wording_version: 'v2', occurred_at: '2026-10-09T00:00:00Z' },
        { decision: 'declined', wording: v1, wording_version: 'v1', occurred_at: '2026-09-01T00:00:00Z' },
      ])?.wording_version,
    ).toBe('v2')
  })
  test('no event, no consent', () => {
    expect(standingBookedproofConsent([])).toBeNull()
  })
  test('only the first word of a name leaves', () => {
    expect(firstNameOf('  Amara  Okafor Smith ')).toBe('Amara')
    expect(firstNameOf(null)).toBeNull()
    expect(firstNameOf('   ')).toBeNull()
  })
})

describe('what an organisation row carries', () => {
  test('the allow-list alone, whatever the table returns beside it', async () => {
    const asked: string[] = []
    const builder = {
      select(cols: string) { asked.push(cols); return builder },
      order() { return builder },
      limit() { return builder },
      gt() { return builder },
      then(resolve: (v: unknown) => void) {
        resolve({
          data: [{ id: 'org-1', name: 'Fed Square Nights', slug: 'fed-square-nights', status: 'active', founding_city: 'melbourne', created_at: '2026-09-01T00:00:00Z', total_event_count: 3, total_volume_cents: 125000, email: 'owner@example.com', abn: '12345678901', stripe_account_id: 'acct_1' }],
          error: null,
        })
      },
    }
    const admin = { from: () => builder } as unknown as Parameters<typeof readOrganisationsPage>[0]
    const page = await readOrganisationsPage(admin, { after: null, limit: 200 })
    expect(asked[0]).not.toMatch(/email|abn|stripe|phone|payout|bank/)
    expect(page.rows).toEqual([{ id: 'org-1', name: 'Fed Square Nights', slug: 'fed-square-nights', status: 'active', city: 'melbourne', created_at: '2026-09-01T00:00:00Z', event_count: 3, volume_cents: 125000 }])
    expect(page.next).toBeNull()
  })
})

describe('the owner\'s one sentence', () => {
  test('money first, then buyers, events and organisers, singular where one', () => {
    const totals = totalReads([
      { metadata: { scope: 'ledger', rows: 200 } },
      { metadata: { scope: 'ledger', rows: 14 } },
      { metadata: { scope: 'buyers', rows: 61 } },
      { metadata: { scope: 'organisations', rows: 1 } },
      { metadata: { scope: 'profiles', rows: 99 } },
      { metadata: null },
    ])
    expect(readsSentence(totals, 'today')).toBe('Bookedproof read 214 orders, 61 consented buyers and 1 organiser today.')
  })
  test('a day with no read says so', () => {
    expect(readsSentence(emptyTotals(), 'today')).toBe('Bookedproof read nothing today.')
  })
  test('two kinds join with and', () => {
    expect(readsSentence({ ...emptyTotals(), ledger: 214, buyers: 61 }, 'today')).toBe('Bookedproof read 214 orders and 61 consented buyers today.')
  })
})
