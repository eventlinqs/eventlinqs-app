import { describe, expect, test } from 'vitest'
import {
  judgeLifecycle,
  predicateLines,
  effectiveDefinition,
  collectFacts,
  DOOR_FUNCTIONS,
  CONTROL_SURFACES,
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
