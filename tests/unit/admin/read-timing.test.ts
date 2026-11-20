import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readClock, readTimesLine } from '@/lib/admin/read-timing'

/*
 * EACH ADMIN READ TIMED (law 41; the PM's 00:05:28 of 21 November 2026, item 1): the runtime log of any visit names the
 * read that holds the page, slowest first, and the timer changes no answer and swallows no error.
 */
const wait = <T,>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms))

describe('the read clock', () => {
  test('every read is timed, the line names them slowest first, and each answer is unchanged', async () => {
    const { timed, report } = readClock('/admin/today')
    const [a, b] = await Promise.all([timed('fast', wait(5, 'A')), timed('slow', wait(60, 'B'))])
    expect([a, b]).toEqual(['A', 'B'])
    const t = report()
    expect(t.reads.map((r) => r.name)).toEqual(['slow', 'fast'])
    expect(t.reads[0].ms).toBeGreaterThanOrEqual(50)
    expect(readTimesLine(t)).toMatch(/^\[admin-read\] \/admin\/today \d+ ms: slow \d+, fast \d+$/)
  })

  test('a read that fails still throws its own error, after it is timed and marked failed', async () => {
    const { timed, report } = readClock('/admin/today')
    await expect(timed('broken', Promise.reject(new Error('the queue could not be read')))).rejects.toThrow('the queue could not be read')
    expect(readTimesLine(report())).toContain('broken')
    expect(report().reads[0].failed).toBe(true)
  })

  test("/admin/today times each of its eleven reads and logs the line once they settle", () => {
    const page = readFileSync(join(process.cwd(), 'src', 'app', 'admin', '(authed)', 'today', 'page.tsx'), 'utf8')
    expect(page.match(/timed\('/g)?.length).toBe(11)
    expect(page).toContain('console.log(readTimesLine(clock.report()))')
  })
})
