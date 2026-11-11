import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextStep, holdWalkSql, holdsVerdict, factHoldAnswer, DAY_MS, WEEK_MS, type OpenHold } from '@/lib/listings/hold-walk'
import { resolveFact, type Reading } from '@/lib/listings/resolver'

/*
 * A HOLD IS NEVER LEFT HANGING (Lawal, 7 November 2026; the CONTROLLER's 16:55 (1)). The resolver walks every open hold
 * whose next check is due and applies the one rule: the source states the night, the hold is released; it states the night
 * cancelled or ended, the night is cancelled, never left held; it states nothing, the next source tomorrow, and when every
 * source has been read and none states it, the hold is 'unconfirmed' and read again weekly. Never a hold with no next action.
 */
const NOW = new Date('2026-11-07T07:00:00Z')
const hold = (over: Partial<OpenHold> = {}): OpenHold => ({
  id: 'h1',
  eventId: 'e1',
  scope: 'night',
  field: 'start',
  state: 'held',
  nextSource: 'https://hoptemple.com.au/',
  sourcesTried: [],
  sources: ['https://hoptemple.com.au/', 'https://www.kaze.com.au/karaoke.html'],
  ...over,
})

describe('the next step of an open hold', () => {
  it('a source that states the night releases it, naming the source and its words', () => {
    expect(nextStep(hold(), { kind: 'states', words: "'Every Saturday' '9pm'" }, NOW)).toEqual({
      kind: 'release',
      by: "the resolver: https://hoptemple.com.au/ states 'Every Saturday' '9pm'",
    })
  })
  it('a source that states it cancelled or ended cancels the night, never leaves it held', () => {
    expect(nextStep(hold(), { kind: 'cancelled', words: "'This event has been cancelled'" }, NOW).kind).toBe('cancel')
  })
  it('a source that states nothing moves to the next source, read tomorrow', () => {
    const s = nextStep(hold(), { kind: 'silent', why: 'no reader finds a night on this page' }, NOW)
    expect(s).toMatchObject({ kind: 'next', state: 'held', nextSource: 'https://www.kaze.com.au/karaoke.html' })
    expect(s.kind === 'next' && Date.parse(s.nextCheckAt) - NOW.getTime()).toBe(DAY_MS)
  })
  it('when every source has been read and none states it, the hold is unconfirmed and read again weekly', () => {
    const tried = hold({ nextSource: 'https://www.kaze.com.au/karaoke.html', sourcesTried: [{ url: 'https://hoptemple.com.au/', at: NOW.toISOString(), stated: null }] })
    const s = nextStep(tried, { kind: 'silent', why: 'robots.txt disallows a re-read' }, NOW)
    expect(s).toMatchObject({ kind: 'next', state: 'unconfirmed', nextSource: 'https://hoptemple.com.au/' })
    expect(s.kind === 'next' && Date.parse(s.nextCheckAt) - NOW.getTime()).toBe(WEEK_MS)
  })
  it('every step that keeps a hold open names its next source and its time', () => {
    for (const answer of [{ kind: 'silent' as const, why: 'x' }]) {
      const s = nextStep(hold({ sources: [] }), answer, NOW)
      expect(s.kind === 'next' && s.nextSource && s.nextCheckAt).toBeTruthy()
    }
  })
})

describe('the verifier on the open holds', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
  it('reds a hold with no next action, and one whose check is more than a day overdue', () => {
    const red = holdsVerdict(
      [
        { id: 'a', title: 'Granny Bingo', nextSource: null, nextCheckAt: null },
        { id: 'b', title: 'The Peter Tobin Oration', nextSource: 'https://v/', nextCheckAt: at(-2 * DAY_MS) },
        { id: 'c', title: 'Fine', nextSource: 'https://v/', nextCheckAt: at(DAY_MS) },
        { id: 'd', title: 'Just due', nextSource: 'https://v/', nextCheckAt: at(-60 * 60 * 1000) },
      ],
      NOW,
    )
    expect(red.map((r) => r.id)).toEqual(['a', 'b'])
    expect(red[0].why).toContain('no next action')
    expect(red[1].why).toContain('overdue')
  })
  it('no open hold, nothing red', () => {
    expect(holdsVerdict([], NOW)).toEqual([])
  })
})

describe("the walk's reviewed file", () => {
  it('a release frees a held night and closes its hold with what was read', () => {
    const sql = holdWalkSql([{ hold: hold(), step: { kind: 'release', by: "the resolver: x states 'y'" } }])
    expect(sql).toContain("update public.events set visibility = 'public' where id = 'e1' and visibility = 'private';")
    expect(sql).toContain("update public.listing_holds set released_at = now(), released_by = 'the resolver: x states ''y''' where id = 'h1' and released_at is null;")
  })
  it("a cancel cancels only EventLinqs' own listing night, never an organiser's event, and closes the hold", () => {
    const sql = holdWalkSql([{ hold: hold(), step: { kind: 'cancel', by: 'the resolver: x states cancelled' } }])
    expect(sql).toContain("update public.events set status = 'cancelled' where id = 'e1' and status = 'published' and listing_source = 'eventlinqs';")
    expect(sql).toContain('released_at = now()')
  })
  it('a next step records the source read and names the next', () => {
    const sql = holdWalkSql([{ hold: hold(), step: { kind: 'next', state: 'held', nextSource: 'https://k/', nextCheckAt: '2026-11-08T07:00:00.000Z', tried: { url: 'https://hoptemple.com.au/', at: NOW.toISOString(), stated: null } } }])
    expect(sql).toContain("set state = 'held', next_source = 'https://k/', next_check_at = '2026-11-08T07:00:00.000Z', sources_tried = sources_tried || ")
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('rollback;')).toBe(true)
  })
  it('the reviewed apply takes the walk file as written', async () => {
    const { reviewedBody } = await import('../../../scripts/ops/apply-reviewed-sql-production.mjs')
    const sql = holdWalkSql([
      { hold: hold(), step: { kind: 'release', by: "x states 'y'; z" } },
      { hold: hold({ id: 'h2', eventId: 'e2' }), step: { kind: 'cancel', by: 'x' } },
      { hold: hold({ id: 'h3' }), step: { kind: 'next', state: 'unconfirmed', nextSource: 'https://k/', nextCheckAt: '2026-11-14T07:00:00.000Z', tried: { url: "https://o'neil/", at: '2026-11-07T07:00:00.000Z', stated: null } } },
    ])
    const out = reviewedBody(sql) as { refused?: string; statements?: number }
    expect(out.refused).toBeUndefined()
    expect(out.statements).toBe(5)
  })
  it('a fact hold released never touches the night', () => {
    const sql = holdWalkSql([{ hold: hold({ scope: 'fact', field: 'price' }), step: { kind: 'release', by: 'x' } }])
    expect(sql).not.toContain('update public.events')
  })
})

/*
 * A FACT HOLD IS RELEASED ONLY ON THE RESOLVER'S OWN RULING (WINDOW 5A, 11 November 2026). The Peter Tobin Oration's price
 * was held because its officials disagree (the venue's page 1500, Eventbrite 1200, ours 1200). The walk read Eventbrite
 * alone, saw our 1200 and would have released it, while the resolver, reading both, holds it again: left out of the walk by
 * hand, the hold went a day overdue and the engine verifier went red. The walk now asks resolveFact over every official.
 */
describe('a fact hold is answered by the resolver over every official', () => {
  const VENUE = 'https://eurekacentreballarat.com.au/events/oration-cathy-mcgowan/'
  const SELLER = 'https://petertobinoration2026.eventbrite.com.au'
  const read = (venue: string | null, seller: string | null): Reading[] => [
    { kind: 'venue', url: VENUE, value: venue },
    { kind: 'seller', url: SELLER, value: seller },
  ]

  it('the Peter Tobin Oration: the seller states our price but the venue still states another, so it stays held', () => {
    const answer = factHoldAnswer('price', '1200', VENUE, read('1500', '1200'))
    expect(answer.kind).toBe('silent')
    expect(answer).toMatchObject({ why: expect.stringContaining('the officials still disagree on its price') })
    expect(answer).toMatchObject({ why: expect.stringContaining("eurekacentreballarat.com.au '1500'") })
    expect(answer).toMatchObject({ why: expect.stringContaining("petertobinoration2026.eventbrite.com.au '1200'") })
  })

  it('every official that states it states our price: released, naming each', () => {
    const answer = factHoldAnswer('price', '1200', VENUE, read('1200', '1200'))
    expect(answer).toEqual({
      kind: 'states',
      words: "its price '1200', as every official that states it does (eurekacentreballarat.com.au '1200', petertobinoration2026.eventbrite.com.au '1200')",
    })
  })

  it('one official silent and the other stating our price: released on the one that states it', () => {
    expect(factHoldAnswer('price', '1200', VENUE, read(null, '1200')).kind).toBe('states')
  })

  it('no official states it: stays held, never released on silence', () => {
    const answer = factHoldAnswer('price', '1200', VENUE, read(null, null))
    expect(answer.kind).toBe('silent')
    expect(answer).toMatchObject({ why: expect.stringContaining('no official states its price') })
  })

  it('the officials agree on another value: stays held for the resolver to correct, never released as if ours were right', () => {
    const answer = factHoldAnswer('price', '1200', VENUE, read('1500', '1500'))
    expect(answer.kind).toBe('silent')
    expect(answer).toMatchObject({ why: expect.stringContaining("the officials agree on another price, '1500'") })
  })

  it('a listing site alone never releases a fact hold (it is not an official)', () => {
    const listing: Reading[] = [{ kind: 'listing', url: 'https://whatson.melbourne.vic.gov.au/x', value: '1200' }]
    expect(factHoldAnswer('price', '1200', listing[0].url, listing).kind).toBe('silent')
  })

  it('the walk releases exactly when the resolver would keep our value, over every combination of two officials', () => {
    const values = [null, '1200', '1500']
    for (const venue of values) {
      for (const seller of values) {
        const readings = read(venue, seller)
        const ruling = resolveFact({ field: 'price', stored: '1200', ownUrl: VENUE, readings })
        const keeps = ruling.kind === 'keep' || (ruling.kind === 'resource' && !ruling.corrected)
        expect(factHoldAnswer('price', '1200', VENUE, readings).kind === 'states', `venue ${venue}, seller ${seller}`).toBe(keeps)
      }
    }
  })

  it('the walk asks factHoldAnswer for every fact hold, over every official the hold recorded (the class cannot return)', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'verify', 'resolve-run.mts'), 'utf8').replace(/\r\n/g, '\n')
    const walk = src.slice(src.indexOf('if (WALK) {'))
    expect(walk).toContain("if (h.scope === 'fact' && officials.length > 0) {")
    expect(walk).toContain('for (const r of officials) fresh.push({ kind: r.kind, url: r.url, value: await statedBy(r.url, h.field, h) })')
    expect(walk).toContain("answer = factHoldAnswer(asField(h.field), storedOf(h.field, h) ?? '', ownUrl, fresh)")
    expect(walk.indexOf('factHoldAnswer(asField')).toBeLessThan(walk.indexOf('} else if (hold.nextSource) {'))
  })
})
