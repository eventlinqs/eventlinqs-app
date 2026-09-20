import { describe, expect, test } from 'vitest'
import {
  judgeLifecycle,
  predicateLines,
  effectiveDefinition,
  collectFacts,
  DOOR_FUNCTIONS,
  CONTROL_SURFACES,
  AFTER_THE_FACT_CALLERS,
} from '../../../scripts/guards/event-lifecycle-total.mjs'

const STATUSES = ['draft', 'scheduled', 'published', 'paused', 'postponed', 'cancelled', 'completed', 'archived']

function goodFacts() {
  return {
    statuses: STATUSES,
    deadEnds: [] as string[],
    archivedExits: ['restore'],
    canArchive: { cancelled: true, completed: true },
    directFromArchived: Object.fromEntries(STATUSES.map((s) => [s, false])),
    publishedStatus: 'published',
    sqlForm: "status = 'published' and visibility = 'public' and external_ticket_url is null",
    surfaces: CONTROL_SURFACES.map((file) => ({ file, rendersControls: true })),
    componentAsksModule: true,
    doors: DOOR_FUNCTIONS.map((fn) => ({ fn, file: '20260905000002_door_realtime.sql', predicateAt: [] as string[] })),
    // Clause 7 (close-out SEO5 step 5): the four states whose public URL is a
    // full page with a banner, the two surfaces that must consult the one door,
    // and the two constraints that keep that door narrow.
    afterTheFact: ['paused', 'postponed', 'cancelled', 'completed'],
    // AFTER_THE_FACT_CALLERS is a list of paths since 20 September 2026: which
    // CALL counts as consulting the door is derived from the door's own exports
    // rather than typed per caller, so the two entries carry no regex any more.
    afterTheFactCallers: AFTER_THE_FACT_CALLERS.map((file) => ({ file, consults: true })),
    afterTheFactDoorReads: 2,
    afterTheFactDoorConstrainsStatus: true,
    afterTheFactDoorConstrainsVisibility: true,
  }
}

describe('judgeLifecycle', () => {
  test('passes on a total lifecycle', () => {
    expect(judgeLifecycle(goodFacts())).toEqual([])
  })

  test('a dead end fails, naming the status', () => {
    const f = goodFacts()
    f.deadEnds = ['cancelled']
    expect(judgeLifecycle(f).join('\n')).toMatch(/dead end: cancelled/)
  })

  test('cancelled or completed that cannot archive fails', () => {
    const f = goodFacts()
    f.canArchive.completed = false
    expect(judgeLifecycle(f).join('\n')).toMatch(/completed cannot be archived/)
  })

  test('archived leaving by anything but restore fails', () => {
    const f = goodFacts()
    f.archivedExits = ['restore', 'published']
    expect(judgeLifecycle(f).join('\n')).toMatch(/only by restore/)
    const g = goodFacts()
    g.directFromArchived.published = true
    expect(judgeLifecycle(g).join('\n')).toMatch(/archived -> published is a direct transition/)
  })

  test('the public rule drifting off published fails, in either form', () => {
    const f = goodFacts()
    f.publishedStatus = 'live'
    expect(judgeLifecycle(f).join('\n')).toMatch(/PUBLIC_EVENT_MATCH/)
    const g = goodFacts()
    g.sqlForm = "visibility = 'public'"
    expect(judgeLifecycle(g).join('\n')).toMatch(/publicEventVisibilitySql/)
  })

  test('a surface that drops the controls, or a component with its own status list, fails', () => {
    const f = goodFacts()
    f.surfaces[0].rendersControls = false
    expect(judgeLifecycle(f).join('\n')).toMatch(/events-table.tsx does not render/)
    const g = goodFacts()
    g.componentAsksModule = false
    expect(judgeLifecycle(g).join('\n')).toMatch(/canArchive\(\) and restoreTarget\(\)/)
  })

  test('a door function reading event status fails, naming the line', () => {
    const f = goodFacts()
    f.doors[0].predicateAt = ["line 9: WHERE e.id = p_event_id AND e.status = 'published'"]
    expect(judgeLifecycle(f).join('\n')).toMatch(/scan_ticket .* reads event status/)
    const g = goodFacts()
    g.doors[1].file = null as unknown as string
    expect(judgeLifecycle(g).join('\n')).toMatch(/no migration defines door_validation_set/)
  })
})

describe('clause 7: the four after-the-fact states reach their page', () => {
  /*
   * WHY THIS CLAUSE EXISTS. paused, postponed, cancelled and completed answered
   * a real 404 on their own public page for months, against a document that
   * says all four render a full page with a banner: the row-level security
   * policies admit `status = 'published'` and nothing else, so the anonymous
   * read found no row and the route guard called notFound(). The page's banner
   * code for all four had never run for a stranger, and nothing in the
   * repository could have said so.
   */
  test('a status dropping out of the classification fails, naming it', () => {
    const f = goodFacts()
    f.afterTheFact = ['paused', 'postponed', 'completed']
    expect(judgeLifecycle(f).join('\n')).toMatch(
      /cancelled is not in PUBLIC_AFTER_THE_FACT_STATUSES/,
    )
  })

  test('archived creeping into the classification fails', () => {
    // Its page is per viewer. Admitting it here publishes every archived event
    // to everybody, which is the opposite of what archiving means.
    const f = goodFacts()
    f.afterTheFact = ['paused', 'postponed', 'cancelled', 'completed', 'archived']
    expect(judgeLifecycle(f).join('\n')).toMatch(/archived is in PUBLIC_AFTER_THE_FACT_STATUSES/)
  })

  test('a caller that stops consulting the door fails, naming the file', () => {
    const f = goodFacts()
    f.afterTheFactCallers = [{ file: 'src/app/events/[slug]/layout.tsx', consults: false }]
    expect(judgeLifecycle(f).join('\n')).toMatch(/no longer consults the after-the-fact door/)
  })

  test('a read in the door without a status constraint fails', () => {
    const f = goodFacts()
    f.afterTheFactDoorConstrainsStatus = false
    expect(judgeLifecycle(f).join('\n')).toMatch(/a read that does not constrain status/)
  })

  test('a read in the door without a visibility constraint fails', () => {
    const f = goodFacts()
    f.afterTheFactDoorConstrainsVisibility = false
    expect(judgeLifecycle(f).join('\n')).toMatch(/a read that does not constrain visibility/)
  })

  test('a door with no read at all fails, because the check cannot aim', () => {
    const f = goodFacts()
    f.afterTheFactDoorReads = 0
    expect(judgeLifecycle(f).join('\n')).toMatch(/makes no read of events/)
  })
})

describe('predicateLines', () => {
  test('finds an event status predicate and ignores ticket status and comments', () => {
    const body = [
      'SELECT t.id, t.status FROM public.tickets t',
      '-- e.status is mentioned in a comment only',
      "WHERE e.id = p_event_id AND e.status = 'published'",
      "ELSIF v_ticket.status = 'scanned' THEN",
    ].join('\n')
    expect(predicateLines(body)).toEqual(["line 3: WHERE e.id = p_event_id AND e.status = 'published'"])
  })
})

describe('against the real tree', () => {
  test('the effective definition of each door function is found in a migration', () => {
    for (const fn of DOOR_FUNCTIONS) {
      const def = effectiveDefinition(fn)
      expect(def.file, fn).toMatch(/\.sql$/)
      expect(def.body).toMatch(new RegExp(`FUNCTION\\s+public\\.${fn}\\s*\\(`))
    }
  })

  test('the live tree passes the judgement', () => {
    const facts = collectFacts()
    expect(facts.statuses).toContain('archived')
    expect(judgeLifecycle(facts)).toEqual([])
  }, 60000)
})
