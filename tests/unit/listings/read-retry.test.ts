import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { READ_TRIES, readAgain } from '@/lib/listings/read-retry'

/*
 * A PASSING FAULT IS READ AGAIN (16 November 2026): H2o New Year's Eve was held at 13:11 because its organiser's page did
 * not answer within 12 seconds. A page that timed out or could not be reached is read again on the next run; held only
 * after READ_TRIES such reads; a page that answered is judged at once.
 */
describe('a booking page that could not be read at all', () => {
  it('is read again on the next run, H2o first, up to the last try', () => {
    expect(readAgain({ ok: false, reason: 'the page did not answer in time' }, { notice_held: true })).toEqual({ again: true, tries: 1 })
    expect(readAgain({ ok: false, reason: 'the page could not be reached' }, { read_tries: 1 })).toEqual({ again: true, tries: 2 })
    expect(readAgain({ ok: false, reason: 'the page did not answer in time' }, { read_tries: READ_TRIES - 1 })).toEqual({ again: false })
  })

  it('a page that answered, or answered with a refusal, is judged at once, never read again', () => {
    expect(readAgain({ ok: true }, null)).toEqual({ again: false })
    expect(readAgain({ ok: false, reason: 'robots.txt refuses it' }, null)).toEqual({ again: false })
  })

  it('the run asks before it judges, and keeps the held notice when it waits', () => {
    const run = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8').replace(/\r\n/g, '\n')
    const asked = run.indexOf('const again = readAgain(reading, sub.check_result)')
    const judged = run.indexOf('let verdict: SelfListingVerdict = judgeSelfListing(')
    expect(asked).toBeGreaterThan(-1)
    expect(asked).toBeLessThan(judged)
    expect(run).toContain("check_result: { ...(sub.check_result ?? {}), read_tries: again.tries, last_read: reading.reason }")
  })
})
