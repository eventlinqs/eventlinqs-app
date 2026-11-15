import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: vi.fn() }))

import { actionsForEventStatus, featureAllowed, listOrder } from '@/lib/admin/events'
import { EVENT_STATUSES } from '@/lib/event-lifecycle'
import { gateNames, PLAN_GATES } from '@/lib/growth/plan-gates-math'

/*
 * ADMIN 2, scored 9.2 (the PM's 05:37 of 16 November 2026): the events list led with archived test rows (fix 3), the event
 * page offered 'Feature event' on an archived event (fix 4), and Today's gates read as a repeat (fix 5).
 */
const NOW = new Date('2026-11-16T00:00:00Z')

describe("the events list's default order (fix 3)", () => {
  it('live nights not yet past first by start, then live nights past latest first, then draft, paused, archived last', () => {
    const r = (id: string, status: string, start: string) => ({ id, status, start_date: start })
    const rows = [
      r('arch', 'archived', '2026-12-09T08:30:00Z'),
      r('draft', 'draft', '2026-11-20T08:30:00Z'),
      r('liveLater', 'published', '2026-11-28T08:30:00Z'),
      r('pastOld', 'published', '2026-10-01T08:30:00Z'),
      r('liveSoon', 'published', '2026-11-17T08:30:00Z'),
      r('paused', 'paused', '2026-11-18T08:30:00Z'),
      r('pastNew', 'published', '2026-11-10T08:30:00Z'),
      r('tonight', 'published', '2026-11-15T21:00:00Z'), // three hours ago: still live
    ]
    expect(listOrder(rows, NOW).map((x) => x.id)).toEqual(['tonight', 'liveSoon', 'liveLater', 'pastNew', 'pastOld', 'draft', 'paused', 'arch'])
  })

  it("'All statuses' is sorted whole by listOrder, one status keeps the database's page", () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/admin/events.ts'), 'utf8')
    expect(src).toContain('listOrder(read).slice(fromIdx, fromIdx + PAGE_SIZE + 1)')
  })

  it("each row's name sits on the row's top line, its link still 44 px tall", () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/events/page.tsx'), 'utf8')
    expect(page).toContain('className="inline-flex min-h-11 items-start font-medium text-white hover:underline"')
  })
})

describe('the event page offers only what its status allows (fix 4)', () => {
  for (const status of EVENT_STATUSES) {
    it(`${status}: its actions and whether it may be featured`, () => {
      const actions = actionsForEventStatus(status)
      if (status === 'archived') {
        expect(actions).toEqual(['restore'])
        expect(featureAllowed(status)).toBe(false)
      } else {
        expect(actions).not.toContain('restore')
        expect(featureAllowed(status)).toBe(status === 'published')
      }
    })
  }

  it('the page shows the feature form only where featureAllowed says so', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/events/[id]/page.tsx'), 'utf8')
    expect(page).toContain('{featureAllowed(event.status) ? (')
  })
})

describe("Today's gates named by their order and day (fix 5)", () => {
  it("the two selling gates are 'First gate, 13 Dec' and 'Second gate, 31 Jan'; a gate alone has no name", () => {
    const names = gateNames(PLAN_GATES)
    expect(names.get('selling-20')).toBe('First gate, 13 Dec')
    expect(names.get('selling-50')).toBe('Second gate, 31 Jan')
    expect(names.has('recurring-30')).toBe(false)
  })
})
