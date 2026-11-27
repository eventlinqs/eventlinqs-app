import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { queueLine, SKIP, type PlayReport } from '@/lib/outreach/planner'

/*
 * M1 (the PM's 12:18 of 27 November 2026: "The general play queued 0 at 05:45, and its run line gives no reason why").
 * Red on main, where a contact outside the play's cities, of an organisation already taken, or past the day's cap was
 * passed over with no word: every contact of a play's pool not queued is said with its reason, and the queue run's own
 * row reads "X lawful in pool, Y queued, Z skipped, by reason".
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const report = (over: Partial<PlayReport>): PlayReport => ({ playId: 'p1', name: 'General first letter', cap: 10, usedToday: 0, queued: 0, held: [], refused: [], ...over })

describe('the queue line', () => {
  it('reads the pool, the queued, the held and the skipped by reason, the most common first', () => {
    const r = report({
      pool: 6,
      queued: 1,
      notDrafted: [
        { contactId: 'a', why: SKIP.noCity },
        { contactId: 'b', why: SKIP.noCity },
        { contactId: 'c', why: `${SKIP.otherCity} (warrnambool)` },
        { contactId: 'd', why: `${SKIP.otherCity} (bendigo)` },
        { contactId: 'e', why: `${SKIP.otherCity} (horsham)` },
      ],
    })
    expect(queueLine([r])).toBe(
      "General first letter: 6 lawful in pool, 1 queued, 0 held, 5 skipped (3 outside the play's cities, 2 no city found)",
    )
  })
  it('leaves out a play with no pool, and says a pool with nothing skipped plainly', () => {
    expect(queueLine([report({}), report({ name: 'Law 49 photo', pool: 2, queued: 2 })])).toBe('Law 49 photo: 2 lawful in pool, 2 queued, 0 held, 0 skipped')
  })
})

describe('the planner and the run', () => {
  const planner = read('src/lib/outreach/planner.ts')
  it('says every contact of the pool not queued, never a silent continue', () => {
    expect(planner).toContain("if (seenOrganiser.has(c.organiser_id)) { skip(c.id, SKIP.organisationTaken); continue }")
    expect(planner).toContain('if (allowed && !allowed.has(c.organiser_id)) { skip(c.id, outside.get(c.organiser_id) ?? SKIP.noCity); continue }')
    expect(planner).toContain('if (room <= 0) { skip(c.id, SKIP.cap); continue }')
    expect(planner).toMatch(/else if \(!cities\.has\(o\.id\)\) outside\.set\(o\.id, SKIP\.noCity\)/)
    expect(planner).not.toMatch(/for \(const c of lifecycle \? \[\] : \(candidates\.data \?\? \[\]\)\) \{\n\s+if \(room <= 0\) break/)
  })
  it("the queue run's row carries the line", () => {
    expect(read('src/app/api/cron/outreach-run/route.ts')).toContain('`; queue: ${queueLine(plays as PlayReport[])}`')
  })
})
