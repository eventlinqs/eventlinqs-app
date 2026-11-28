import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isTestSubmitter } from '@/lib/listings/self-listing-run'

/*
 * CAR W (the organiser P0 audit of 27 November 2026, item 8). Red on main, where a submission from a test address was
 * published as a real public night (listing_submissions has no is_test, and the listings organisation is not a test), so
 * the end to end /submit-event test could not run on production: now a test address's series is a test series, its
 * events are born is_test, and IndexNow, like the guides and the sitemap, never names one.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

describe("a test submitter, by the database's own rule", () => {
  it('is hello+qa, hello+test or hello+acceptance at eventlinqs.com, and nobody else', () => {
    for (const a of ['hello+acceptance@eventlinqs.com', 'hello+test@eventlinqs.com', 'hello+qa-submit@eventlinqs.com', ' Hello+Test2@EventLinqs.com ']) expect(isTestSubmitter(a)).toBe(true)
    for (const a of ['hello@eventlinqs.com', 'hello+news@eventlinqs.com', 'hello+test@eventlinqs.com.au', 'someone+test@eventlinqs.com', 'organiser@example.com', null]) expect(isTestSubmitter(a)).toBe(false)
    // The same pattern the database marks a test organisation by (20261121140001).
    expect(read('supabase/migrations/20261121140001_test_accounts_marked.sql')).toContain("'^hello\\+(qa|test|acceptance)[^@]*@eventlinqs\\.com$'")
  })
})

describe('its night is a test from birth, and never named', () => {
  it('marks the series, makes each event is_test at insert, and keeps it from IndexNow', () => {
    expect(read('src/lib/listings/self-listing-run.ts')).toContain('      is_test: isTestSubmitter(sub.email),\n      status: \'active\',\n')
    const store = read('src/lib/listings/occurrence-store.ts')
    expect(store).toContain('booking_links, is_test\')')
    expect(store).toContain('            isTest: r.is_test === true,\n')
    expect(store).toContain('          ...(night.isTest === true ? { is_test: true } : {}),\n')
    const indexNow = read('src/lib/seo/indexnow.ts')
    expect(indexNow.split(".eq('is_test', false)").length - 1).toBe(2)
    expect(read('supabase/migrations/20261128080001_a_test_submission_lists_a_test_night.sql')).toContain('alter table public.event_series add column if not exists is_test boolean not null default false;')
  })
})
