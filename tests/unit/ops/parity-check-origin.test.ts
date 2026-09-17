import { describe, expect, it } from 'vitest'
import { onSite } from '../../../scripts/ops/parity-check.mjs'

/**
 * THE PARITY REVIEW JUDGED PRODUCTION WHILE REPORTING ON THE TARGET.
 *
 * Found on 14 September 2026, the first time the fortnightly check was pointed
 * anywhere but production. A sitemap carries ABSOLUTE URLs and builds them from
 * the origin the application was CONFIGURED with, not the one it was served
 * from, so a local build still publishes `https://www.eventlinqs.com.au/...`.
 * The check opened those, against production, and printed its findings under the
 * heading of the site it had been asked about.
 *
 * Run against a tree that HAD the structured data, the calendar control and the
 * unique titles, the answer was 3 passed and 9 failed. With the origin put back
 * it is 9 passed and 4 failed on the same tree, and one line had read
 *
 *     1 sitemap URL(s) do not answer 200, first:
 *     https://www.eventlinqs.com.au/events/afro-fusion-showcase-... (404)
 *
 * which is a TEST slug read out of the local sitemap and requested against
 * production. A verification tool that fails in the direction of "your fix is
 * not there" is worse than no tool, so this is pinned.
 */

const SITE = 'http://localhost:3200'

describe('onSite', () => {
  it('puts an absolute URL from another origin back on the site under test', () => {
    expect(onSite('https://www.eventlinqs.com.au/events/lane-c-night', SITE)).toBe(`${SITE}/events/lane-c-night`)
  })

  it('leaves a URL already on the site under test alone', () => {
    expect(onSite(`${SITE}/events/lane-c-night`, SITE)).toBe(`${SITE}/events/lane-c-night`)
  })

  it('resolves a relative path against the site under test', () => {
    expect(onSite('/pricing', SITE)).toBe(`${SITE}/pricing`)
  })

  it('keeps a query string, because a sitemap URL that carries one is itself a finding', () => {
    // `no-query-string-only-discovery` fails on exactly this shape, so dropping
    // the query here would hide the thing another line exists to catch.
    expect(onSite('https://www.eventlinqs.com.au/events?category=music', SITE)).toBe(`${SITE}/events?category=music`)
  })

  it('keeps an unparseable value verbatim rather than dropping it', () => {
    // A malformed sitemap must stay visible to the lines that judge it. A
    // silently discarded URL is a sitemap fault nobody is ever shown.
    expect(onSite('not a url at all', SITE)).toBe(`${SITE}/not%20a%20url%20at%20all`)
    expect(onSite('http://[', SITE)).toBe('http://[')
  })
})
