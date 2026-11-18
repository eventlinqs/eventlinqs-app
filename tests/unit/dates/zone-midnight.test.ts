import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { dayStart } from '@/lib/social/cadence'

/*
 * MIDNIGHT IN A ZONE, TRUE ON A DAYLIGHT SAVING DAY (car D, 19 November 2026; law 4: one defect is a class). Found by the
 * engine page's own test: taking the clock time off an instant lands an hour late on Melbourne's 25 hour day and an hour
 * early on its 23 hour day. Three helpers did it; all now go through midnightIn, and this guard keeps the shape out.
 */
const MEL = 'Australia/Melbourne'

describe('midnightIn', () => {
  it('an ordinary day in daylight time', () => {
    expect(midnightIn(new Date('2026-11-18T16:30:00Z'), MEL).toISOString()).toBe('2026-11-18T13:00:00.000Z')
  })
  it('the day daylight saving ends (Sunday 5 April 2026, 25 hours): midnight is still in daylight time', () => {
    expect(midnightIn(new Date('2026-04-05T02:00:00Z'), MEL).toISOString()).toBe('2026-04-04T13:00:00.000Z')
    expect(midnightIn(new Date('2026-04-05T13:59:00Z'), MEL).toISOString()).toBe('2026-04-04T13:00:00.000Z')
    expect(midnightIn(new Date('2026-04-05T14:00:00Z'), MEL).toISOString()).toBe('2026-04-05T14:00:00.000Z')
  })
  it('the day daylight saving starts (Sunday 4 October 2026, 23 hours): midnight is still in standard time', () => {
    expect(midnightIn(new Date('2026-10-04T01:00:00Z'), MEL).toISOString()).toBe('2026-10-03T14:00:00.000Z')
    expect(midnightIn(new Date('2026-10-04T12:59:00Z'), MEL).toISOString()).toBe('2026-10-03T14:00:00.000Z')
    expect(midnightIn(new Date('2026-10-04T13:00:00Z'), MEL).toISOString()).toBe('2026-10-04T13:00:00.000Z')
  })
  it("the social calendar's dayStart is the same rule", () => {
    expect(dayStart(new Date('2026-04-05T02:00:00Z'), MEL).toISOString()).toBe('2026-04-04T13:00:00.000Z')
  })
})

describe('the class is closed: no other helper finds midnight by taking the clock time off', () => {
  it('src holds the shape only in zone-midnight.ts', () => {
    const root = join(process.cwd(), 'src')
    const found: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && /% 24\) \* 3600/.test(readFileSync(p, 'utf8'))) found.push(p.slice(root.length + 1).replace(/\\/g, '/'))
      }
    }
    walk(root)
    expect(found).toEqual(['lib/dates/zone-midnight.ts'])
  })
})
