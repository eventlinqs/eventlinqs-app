import { describe, expect, it } from 'vitest'
import { nextStep, holdWalkSql, holdsVerdict, DAY_MS, WEEK_MS, type OpenHold } from '@/lib/listings/hold-walk'

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
