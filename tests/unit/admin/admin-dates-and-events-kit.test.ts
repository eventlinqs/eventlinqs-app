import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayDate, dayTime } from '@/lib/dates/admin-dates'

/**
 * THE PM'S 02:45 OF 16 NOVEMBER 2026, FIXES 2, 4 AND 5 on the admin: dates as people read them; the events list and an
 * event's own page in the kit; Submitted events' heading with no count when its list could not be read.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

describe('dates as people read them, in Melbourne (fix 4)', () => {
  it("a bare day stays its day; an instant reads 'Wed 9 Dec, 8:30 am'", () => {
    expect(dayDate('2026-12-13')).toBe('13 Dec 2026')
    expect(dayDate('2026-11-15T03:00:00Z')).toBe('15 Nov 2026')
    expect(dayTime('2026-12-08T21:30:00Z', new Date('2026-11-16T00:00:00Z'))).toBe('Wed 9 Dec, 8:30 am')
    expect(dayTime('2027-01-08T09:00:00Z', new Date('2026-11-16T00:00:00Z'))).toBe('Fri 8 Jan 2027, 8:00 pm')
  })
})

describe('the events list and an event page in the kit (fix 2)', () => {
  const list = read('src/app/admin/(authed)/events/page.tsx')
  const detail = read('src/app/admin/(authed)/events/[id]/page.tsx')
  it("the eyebrow is Events, never 'Trust and safety', through the kit's header", () => {
    expect(list).toContain('eyebrow="Events"')
    expect(detail).toContain('eyebrow="Events"')
    expect(list + detail).not.toMatch(/Trust and safety/i)
  })
  it('a counts strip of Live, Draft, Paused and Archived leads the list', () => {
    for (const label of ['Live', 'Draft', 'Paused', 'Archived']) expect(list).toContain(`<StatCard label="${label}"`)
  })
  it('statuses are coloured chips, controls in sentence case, no white block buttons, no machine dates', () => {
    expect(list).toContain('<StatusChip tone={STATUS_CHIP[row.status]')
    expect(detail).toContain('<StatusChip tone={STATUS_CHIP[event.status]')
    expect(list + detail).not.toContain('uppercase')
    expect(list + detail).not.toContain('bg-white/90')
    expect(list + detail).not.toMatch(/startDate\.slice|createdAt\.slice|endDate\.slice/)
  })
})

describe('Submitted events says no count when it could not read its list (fix 5)', () => {
  it('the heading drops its count on a failed read', () => {
    expect(read('src/app/admin/(authed)/submissions/page.tsx')).toContain("{unreadable ? 'Waiting for review' : `Waiting for review (${waiting.length})`}")
  })
})
