import { describe, expect, it } from 'vitest'
import { PLAYBOOK, PLAYBOOK_VERSION } from '@/lib/social/playbook'

/*
 * THE PLAYBOOK (Lawal, 23 November 2026, 16:04 and 16:07): every PM RETURN, and every design correction, becomes a rule with
 * its reason. Data only until the creative engine's critic reads it; each rule is whole.
 */
describe('the playbook', () => {
  it('every rule has all five fields, each said', () => {
    expect(PLAYBOOK.length).toBe(9)
    for (const r of PLAYBOOK) {
      expect(Object.keys(r).sort(), r.id).toEqual(['date', 'id', 'reason', 'rule', 'source'])
      for (const field of ['id', 'rule', 'reason', 'source', 'date'] as const) {
        expect(typeof r[field], `${r.id}.${field}`).toBe('string')
        expect(r[field].trim().length, `${r.id}.${field}`).toBeGreaterThan(2)
      }
      expect(r.date, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.id, r.id).toMatch(/^[a-z0-9-]+$/)
      // The house rule on words: no long dash anywhere (law 6).
      expect(`${r.rule} ${r.reason} ${r.source}`, r.id).not.toMatch(/[–—]/)
    }
  })

  it('each rule is named once, and the version is the day of the newest rule', () => {
    expect(new Set(PLAYBOOK.map((r) => r.id)).size).toBe(PLAYBOOK.length)
    expect(PLAYBOOK_VERSION).toBe([...PLAYBOOK.map((r) => r.date)].sort().at(-1))
  })

  it("holds today's two caption returns and seven design corrections", () => {
    expect(PLAYBOOK.map((r) => r.id)).toEqual([
      'caption-feed-date-line',
      'caption-credit-names-the-organiser',
      'design-no-repeat-of-the-poster',
      'design-comedy-no-cartoon',
      'design-overlapping-times-are-choices',
      'design-no-claim-the-record-does-not-prove',
      'design-one-clear-action',
      'design-seller-in-the-caption',
      'no-relative-date',
    ])
    for (const r of PLAYBOOK.slice(0, 2)) expect(r.source).toContain("the PM's RETURN of 15:30 on piece da22e104")
  })
})
