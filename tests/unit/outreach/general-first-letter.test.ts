import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { generalLetterHeldBy } = await import('@/lib/outreach/general-first-letter')
const { firstLetterFloorLine } = await import('@/lib/outreach/first-letter-floor')

/*
 * THE GENERAL FIRST LETTER (Lawal's founder directive of 26 November 2026, 00:21, item A; the PM's 00:21 and 00:24): an
 * organiser with no night due its own event letter gets the approved general letter, at most the play's cap a day, and a
 * send day under law 38's floor is said every morning with its cause (the PM's 00:17, item D). The cause it answers: from
 * 22 to 25 November no first letter went, because the only automatic road was law 49's clock and nothing said so.
 */

const NOW = new Date('2026-11-26T00:00:00Z') // Thursday 26 November 2026, 11:00 in Melbourne
const DAY = 86_400_000
const night = (title: string, days: number) => ({ eventId: `e-${title}`, title, startDate: new Date(NOW.getTime() + days * DAY + 9 * 3_600_000).toISOString(), timezone: 'Australia/Melbourne' })

describe('the general letter never takes the event letter\'s place', () => {
  it("an organiser whose night is due its own letter on law 49's clock is passed over, with why", () => {
    const why = generalLetterHeldBy([night('Carols', 18)], NOW)
    expect(why).toMatch(/^their night 'Carols' is due its own event letter on law 49's clock \(\d+ days to go\): the general letter never takes its place$/)
  })

  it('nor while a night of theirs is inside its final week, when nothing new goes to them', () => {
    expect(generalLetterHeldBy([night('Jazz', 1)], NOW)).toBe("their night 'Jazz' is inside its final week (7 days), when nothing new goes to them (law 49's clock)")
    expect(generalLetterHeldBy([night('Palais', 6)], NOW)).toMatch(/inside its final week/)
  })

  it('an organiser with no night listed, or only nights beyond the window, gets the general letter', () => {
    expect(generalLetterHeldBy([], NOW)).toBeNull()
    expect(generalLetterHeldBy([night('Racecourse', 38)], NOW)).toBeNull()
    expect(generalLetterHeldBy([night('Novotel', 30)], NOW)).toBeNull()
  })

  it('any one night decides it: the soonest due night holds the organiser whatever the others', () => {
    expect(generalLetterHeldBy([night('Later', 40), night('Due', 15)], NOW)).toMatch(/^their night 'Due' is due its own event letter/)
  })
})

describe('the morning says a send day under the floor, with its cause', () => {
  const base = { day: 'Wednesday', sendDay: true, sent: 0, drafted: 0, held: 0, queued: 0, pool: 12 }

  it('nothing drafted: the queue was empty, and the pool under ten is said too', () => {
    expect(firstLetterFloorLine({ ...base, pool: 5 })).toBe(
      'Wednesday: 0 of the floor of 10 first letters sent, UNDER THE FLOOR: nothing was drafted, so the queue was empty. UNDER THE FLOOR AHEAD: the pool of organisers never written in the four guide cities holds 5, under 10; discovery is short.',
    )
  })

  it('drafted but all held; and some sent, some held, some queued unsent', () => {
    expect(firstLetterFloorLine({ ...base, drafted: 4, held: 4 })).toBe(
      'Wednesday: 0 of the floor of 10 first letters sent, UNDER THE FLOOR: 4 drafted, all still held, so the queue was empty. The pool of organisers never written in the four guide cities holds 12.',
    )
    expect(firstLetterFloorLine({ ...base, sent: 3, drafted: 5, held: 1, queued: 1 })).toMatch(/: 3 of the floor of 10 first letters sent, UNDER THE FLOOR: 5 drafted, 1 still held, 1 queued and not sent\./)
  })

  it('at the floor, or a day that is not a send day, says so plainly; a pool not read is never a calm zero', () => {
    expect(firstLetterFloorLine({ ...base, sent: 10, drafted: 10 })).toBe('Wednesday: 10 first letters sent, at or over the floor of 10. The pool of organisers never written in the four guide cities holds 12.')
    expect(firstLetterFloorLine({ ...base, day: 'Sunday', sendDay: false, pool: null })).toBe('Sunday was not a send day. The pool could not be read.')
  })
})

describe('the wiring, as the planner and the report run it', () => {
  const planner = readFileSync('src/lib/outreach/planner.ts', 'utf8').replace(/\r\n/g, '\n')
  const route = readFileSync('src/app/api/cron/health-heartbeat/route.ts', 'utf8').replace(/\r\n/g, '\n')

  it('a play whose cohort says general writes to the four guide cities unless it names its own', () => {
    expect(planner).toContain('export type CohortRule = { cities?: string[]; organisers?: string[]; general?: boolean }')
    expect(planner).toContain('const cohortCities = rule.cities && rule.cities.length > 0 ? rule.cities : general ? [...ACQ_GUIDE_CITIES] : null')
    expect(planner).toContain('allowed = new Set(real.filter((o) => cohortCities.includes(cities.get(o.id) ?? \'\')).map((o) => o.id))')
  })

  it('each organiser is read against the clock before its letter is drafted, and passed over with why', () => {
    const loop = planner.slice(planner.indexOf('for (const c of lifecycle ? [] : (candidates.data ?? []))'))
    const hold = loop.indexOf('const hold = await readGeneralLetterHold(db, c.organiser_id, deps.now)')
    expect(hold).toBeGreaterThan(loop.indexOf('seenOrganiser.add(c.organiser_id)'))
    expect(hold).toBeLessThan(loop.indexOf('await draft(c.id, 1, choice.templateId, choice.half)'))
    expect(loop).toContain('(report.notDrafted ??= []).push({ contactId: c.id, why: hold })')
  })

  it("the day's cap counts every general letter drafted that day, held ones too, so a day never drafts past it", () => {
    expect(planner).toContain(".eq('play_id', play.id).neq('state', 'void').gte('drafted_at', melbourneDayStart(deps.now).toISOString())")
    expect(planner).toMatch(/report\.held\.push\(\{ contactId, why: r\.value\.heldBecause \}\)\n\s+\/\/ A general letter drafted held is one of the day's letters \(it queues itself when it clears\)\.\n\s+if \(general\) room--/)
  })

  it('the 08:00 report reads the floor line every morning, and a failed read is named in it', () => {
    expect(route).toMatch(/const floor = await readFirstLetterFloor\(db, now\)\.catch\(\(err: unknown\) => `not read: /)
    expect(route).toMatch(/answers, perContact, floor(, nextActions)?(, scoreboard)? \}\)/)
  })
})
