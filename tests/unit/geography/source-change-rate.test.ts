// THE RE-READ SCHEDULE's RECORD (Lawal's ruling, relayed by the CONTROLLER 1 November 2026 16:15): each registered
// source's measured change rate and the interval in force, 6 to 24 hours, never longer than a day; the validators for a
// conditional request; a stop on 403 or 429 that says why. WINDOW 3's schedule writes them; the coverage drill down shows them.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (f: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8').replace(/\r\n/g, '\n')

describe('the registry records each source\'s change rate and interval', () => {
  test('the interval is 6 to 24 hours, never longer than a day', () => {
    expect(read('20261101161501_source_change_rate.sql')).toMatch(/refresh_interval_hours integer not null default 24\s+check \(refresh_interval_hours between 6 and 24\)/)
  })

  test('the validators for a conditional request and the counts the rate is measured from are kept', () => {
    const s = read('20261101161501_source_change_rate.sql')
    for (const col of ['last_etag', 'last_modified_header', 'last_content_hash', 'checks_counted', 'changes_counted', 'feed_refresh_interval', 'crawl_delay_seconds', 'stopped_because']) {
      expect(s).toContain(`add column if not exists ${col}`)
    }
  })

  test('the coverage drill down shows each source\'s rate and interval', () => {
    const s = read('20261101162001_city_coverage.sql')
    expect(s).toContain("'change_rate', public.listing_source_change_rate(id)")
    expect(s).toContain("'refresh_interval_hours', refresh_interval_hours")
  })
})
