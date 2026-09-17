import { describe, expect, it } from 'vitest'
// The specification is plain ESM under scripts/, shared with the runner and the guard.
import { PARITY_LINES, judgeParity, parityHeadline, renderParityReport } from '../../../scripts/lib/parity-spec.mjs'

/**
 * THE TABLE STAKES, ONE BROKEN PAGE AT A TIME.
 *
 * Close-out PARITY1 acceptance 2: "A test proves the check fails when a known
 * good page is altered to violate one line, once per line."
 *
 * ============================================================================
 * WHY A SNAPSHOT AND NOT THE INTERNET
 * ============================================================================
 *
 * Every check in `scripts/lib/parity-spec.mjs` is pure: it takes what
 * production served, already fetched, and returns a verdict. So a test can
 * build a world where all fifteen lines pass, break exactly ONE thing, and
 * assert that exactly that line goes red and the others do not.
 *
 * The alternative, running the real checks against the real site, would test
 * the site rather than the checker, would be red for reasons that have nothing
 * to do with this file, and would be unavailable on a plane.
 *
 * ============================================================================
 * THE ASSERTION IS NARROW ON PURPOSE
 * ============================================================================
 *
 * Each case asserts the broken line is `fail` AND that it was `pass` before the
 * break. Without the second half a check that is red on the good world too
 * would "pass" its own drill, which is the shape a broken check hides in.
 */

type Verdict = { id: string; line: string; state: 'pass' | 'fail' | 'blind'; observation: string; page: string | null }

const SITE = 'https://www.eventlinqs.com.au'
const LEAF = `${SITE}/events/lane-c-parity-fixture`
const SOLD_OUT = `${SITE}/events/lane-c-parity-soldout`
const PAST = `${SITE}/events/lane-c-parity-past`
const VENUE = `${SITE}/venues/lane-c-parity-rooms`

function page(url: string, over: Record<string, unknown> = {}) {
  return {
    status: 200,
    url,
    title: `Unique title for ${url}`,
    canonical: new URL(url).pathname,
    metaRobots: 'index, follow',
    h1s: ['One heading'],
    text: 'A page.',
    html: '',
    jsonLd: [],
    images: [],
    hasAddToCalendar: false,
    hasAccessibilitySection: false,
    ...over,
  }
}

/** A world in which every one of the fifteen lines is satisfied. */
function goodSnapshot() {
  const sitemapUrls = [`${SITE}/`, `${SITE}/events`, `${SITE}/categories/music`, LEAF]
  const pages: Record<string, ReturnType<typeof page>> = {}

  pages[`${SITE}/`] = page(`${SITE}/`, {
    images: [{ src: '/hero.avif', alt: 'A crowd at a show', width: 1440, height: 600, ariaHidden: false }],
  })
  pages[`${SITE}/events`] = page(`${SITE}/events`)
  pages[`${SITE}/categories/music`] = page(`${SITE}/categories/music`)

  pages[LEAF] = page(LEAF, {
    text: [
      'Lane C parity fixture',
      'AUD 30.49',
      'AUD 28.50 ticket plus AUD 1.99 fee',
      'Checkout',
      'We accept Visa, Mastercard, Amex, Apple Pay and Google Pay',
    ].join('\n'),
    jsonLd: [
      {
        '@type': 'Event',
        name: 'Lane C parity fixture',
        startDate: '2026-10-10T08:00:00.000Z',
        location: { '@type': 'Place', name: 'Lane C Proof Room' },
        offers: { '@type': 'Offer', name: 'General admission', price: '28.50' },
      },
    ],
    images: [{ src: '/cover.avif', alt: 'The event cover', width: 1200, height: 600, ariaHidden: false }],
    hasAddToCalendar: true,
    hasAccessibilitySection: true,
  })

  pages[SOLD_OUT] = page(SOLD_OUT, { text: 'Lane C parity soldout\nSold out\nJoin the waitlist' })
  pages[PAST] = page(PAST, { text: 'Lane C parity past\nThis event has ended.\nBrowse upcoming events' })
  pages[VENUE] = page(VENUE, { hasAccessibilitySection: true })

  pages[`${SITE}/organisers`] = page(`${SITE}/organisers`, {
    text: 'You own every attendee relationship. Export your attendee list whenever you like.',
  })
  pages[`${SITE}/pricing`] = page(`${SITE}/pricing`)
  pages[`${SITE}/legal/organiser-terms`] = page(`${SITE}/legal/organiser-terms`, {
    text: 'Your payout is released 3 business days after your event ends.',
  })

  return {
    site: SITE,
    at: '2026-09-14T00:00:00.000Z',
    sitemap: { status: 200, urls: sitemapUrls },
    pages,
    probes: {
      '/api/tickets/pass.pkpass': 200,
      '/categories/music': 200,
    },
    leafEventUrl: LEAF,
    soldOutEventUrl: SOLD_OUT,
    pastEventUrl: PAST,
  }
}

function verdictFor(snapshot: unknown, id: string): Verdict {
  const results = judgeParity(snapshot) as Verdict[]
  const found = results.find(r => r.id === id)
  if (!found) throw new Error(`no line with id ${id}`)
  return found
}

describe('the good world passes every line', () => {
  it('all fifteen lines are green before anything is broken', () => {
    const results = judgeParity(goodSnapshot()) as Verdict[]
    const notPassing = results.filter(r => r.state !== 'pass')
    expect(notPassing.map(r => `${r.id}: ${r.state} - ${r.observation}`)).toEqual([])
  })

  it('the headline reads as a clean run', () => {
    expect(parityHeadline(judgeParity(goodSnapshot()))).toBe('Parity: 15 passed, 0 failed.')
  })
})

/**
 * ONE BREAK PER LINE. Each entry names the line's id, what is broken, and the
 * mutation. The assertion runs twice: green on the good world, red after.
 */
const BREAKS: { id: string; what: string; break: (s: ReturnType<typeof goodSnapshot>) => void }[] = [
  {
    id: 'structured-data-on-a-leaf-url',
    what: 'the leaf event page emits an Offer with an empty name',
    break: s => {
      // The exact defect the push gate caught on 14 September: `compact` ran
      // over the top level only, so every nested Offer kept its blanks.
      ;(s.pages[LEAF].jsonLd[0] as Record<string, Record<string, string>>).offers.name = ''
    },
  },
  {
    id: 'sitemap-only-indexable',
    what: 'a sitemap URL carries noindex',
    break: s => {
      s.pages[`${SITE}/categories/music`].metaRobots = 'noindex, follow'
    },
  },
  {
    id: 'guest-checkout',
    what: 'the event page demands an account before a buyer can pay',
    break: s => {
      s.pages[LEAF].text = `${s.pages[LEAF].text}\nSign in to buy tickets`
    },
  },
  {
    id: 'wallet-payment-methods',
    what: 'the event page stops naming Apple Pay',
    break: s => {
      s.pages[LEAF].text = s.pages[LEAF].text.replace('Apple Pay and ', '')
    },
  },
  {
    id: 'wallet-pass',
    what: 'no route serves a wallet pass',
    break: s => {
      s.probes['/api/tickets/pass.pkpass'] = 404
    },
  },
  {
    id: 'all-in-pricing',
    what: 'a ticket price loses its fee breakdown',
    break: s => {
      s.pages[LEAF].text = s.pages[LEAF].text.replace('AUD 28.50 ticket plus AUD 1.99 fee', 'AUD 28.50')
    },
  },
  {
    id: 'add-to-calendar',
    what: 'the event page loses its calendar control',
    break: s => {
      s.pages[LEAF].hasAddToCalendar = false
    },
  },
  {
    id: 'sold-out-state',
    what: 'a sold-out event does not say it is sold out',
    break: s => {
      s.pages[SOLD_OUT].text = 'Lane C parity soldout\nJoin the waitlist'
    },
  },
  {
    id: 'past-event-state',
    what: "a past event's URL answers 404",
    break: s => {
      // The live defect this line exists for: four of eight statuses answered a
      // real 404 against a document that says they are a full page.
      s.pages[PAST].status = 404
    },
  },
  {
    id: 'accessibility-published',
    what: 'no event or venue page publishes accessibility information',
    break: s => {
      s.pages[LEAF].hasAccessibilitySection = false
      s.pages[SOLD_OUT].hasAccessibilitySection = false
      s.pages[PAST].hasAccessibilitySection = false
      s.pages[VENUE].hasAccessibilitySection = false
    },
  },
  {
    id: 'attendee-data-ownership',
    what: 'the organiser pages stop stating the data ownership promise',
    break: s => {
      s.pages[`${SITE}/organisers`].text = 'Sell tickets with EventLinqs.'
    },
  },
  {
    id: 'published-payout-time',
    what: 'no public page says when an organiser is paid',
    break: s => {
      s.pages[`${SITE}/legal/organiser-terms`].text = 'Payouts are processed in the usual way.'
    },
  },
  {
    id: 'alt-text-on-content-images',
    what: 'a content image loses its alt attribute entirely',
    break: s => {
      // NOT an empty alt. An empty alt is the correct markup for a decorative
      // image, and treating the two as one produced three invented P1s on this
      // check's first production run.
      ;(s.pages[LEAF].images[0] as { alt: string | null }).alt = null
    },
  },
  {
    id: 'unique-title-canonical-h1',
    what: 'two indexable pages share a title',
    break: s => {
      s.pages[`${SITE}/events`].title = s.pages[`${SITE}/`].title
    },
  },
  {
    id: 'no-query-string-only-discovery',
    what: 'a category page stops being a real page',
    break: s => {
      s.probes['/categories/music'] = 404
    },
  },
]

describe('one broken page turns exactly one line red', () => {
  it('covers every line in the specification, with none left out', () => {
    // The drill list and the specification cannot drift: a line added without a
    // break here is a line with no proof, and the guard says so too.
    expect(BREAKS.map(b => b.id).sort()).toEqual(
      (PARITY_LINES as { id: string }[]).map(l => l.id).sort(),
    )
  })

  for (const entry of BREAKS) {
    it(`${entry.id}: ${entry.what}`, () => {
      const good = goodSnapshot()
      expect(verdictFor(good, entry.id).state).toBe('pass')

      const broken = goodSnapshot()
      entry.break(broken)
      const after = verdictFor(broken, entry.id)
      expect(after.state, `${entry.id} should be red: ${after.observation}`).toBe('fail')
      expect(after.observation.length).toBeGreaterThan(10)
    })
  }
})

describe('a check that cannot see is blind, never green', () => {
  it('an empty world produces no passes at all', () => {
    const empty = {
      site: SITE,
      at: '2026-09-14T00:00:00.000Z',
      sitemap: { status: 0, urls: [] },
      pages: {},
      probes: {},
      leafEventUrl: null,
      soldOutEventUrl: null,
      pastEventUrl: null,
    }
    const results = judgeParity(empty) as Verdict[]
    expect(results.filter(r => r.state === 'pass')).toEqual([])
    expect(results).toHaveLength(PARITY_LINES.length)
  })

  it('a check that throws is reported blind rather than passed', () => {
    // A crash in one line must never be able to report the platform compliant
    // on that line.
    const results = judgeParity(null) as Verdict[]
    expect(results.filter(r => r.state === 'pass')).toEqual([])
  })
})

describe('the report a person reads', () => {
  it('names the worst failure in the headline the digest carries', () => {
    const broken = goodSnapshot()
    broken.pages[PAST].status = 404
    const headline = parityHeadline(judgeParity(broken))
    expect(headline).toContain('14 passed, 1 failed')
    expect(headline).toContain('a deliberate past event state')
  })

  it('raises a P1 with the exact page and the exact observation', () => {
    const broken = goodSnapshot()
    broken.pages[PAST].status = 404
    const report = renderParityReport(judgeParity(broken), { site: SITE, at: '2026-09-14' })
    expect(report).toContain('P1: a deliberate past event state')
    expect(report).toContain(PAST)
    expect(report).toContain('answers 404')
  })

  it('says plainly when nothing failed rather than printing an empty section', () => {
    const report = renderParityReport(judgeParity(goodSnapshot()), { site: SITE, at: '2026-09-14' })
    expect(report).toContain('No failures. Nothing to raise.')
  })
})

describe('two ways this review reported a correct platform as broken, 14 September 2026', () => {
  /*
   * Both were found by running the check against a LOCAL tree rather than
   * production, which the review had never been pointed at before. Both fail in
   * the direction that matters most: they say a thing is missing when it is
   * there, and a line that is red for months on correct behaviour is a line
   * somebody stops reading.
   */

  it('does not demand a fee breakdown from a free event, because there is no fee', () => {
    const free = goodSnapshot()
    // The good world's page() gives jsonLd an empty-array type, so the shape is
    // restated here rather than assigned into an inferred `never[]`.
    free.pages[LEAF] = page(LEAF, {
      ...free.pages[LEAF],
      text: ['Lane C parity fixture', 'Free', 'Get tickets'].join('\n'),
      jsonLd: [
        {
          '@type': 'Event',
          name: 'Lane C parity fixture',
          startDate: '2026-10-10T08:00:00.000Z',
          location: { '@type': 'Place', name: 'Lane C Proof Room' },
          offers: { '@type': 'Offer', name: 'General admission', price: '0.00' },
        },
      ],
    })
    const verdict = verdictFor(free, 'all-in-pricing')
    expect(verdict.state).toBe('blind')
    expect(verdict.observation).toContain('free')
  })

  it('still fails a PAID event with no breakdown, so the blind above is not an escape hatch', () => {
    const paid = goodSnapshot()
    paid.pages[LEAF].text = ['Lane C parity fixture', 'AUD 30.49', 'Get tickets'].join('\n')
    const verdict = verdictFor(paid, 'all-in-pricing')
    expect(verdict.state).toBe('fail')
    expect(verdict.observation).toContain('fee breakdown')
  })

  it('reads the price from the structured data rather than from the word "Free" in the prose', () => {
    // A page can say "Free" for half a dozen unrelated reasons: a free drink, a
    // free guest list, free entry before nine. The offers are the number.
    const paid = goodSnapshot()
    paid.pages[LEAF].text = ['Free parking at the venue', 'AUD 30.49', 'Get tickets'].join('\n')
    expect(verdictFor(paid, 'all-in-pricing').state).toBe('fail')
  })

  it('says an empty accessibility catalogue is an empty catalogue, not a missing surface', () => {
    const empty = goodSnapshot()
    empty.pages[LEAF].hasAccessibilitySection = false
    empty.pages[VENUE].hasAccessibilitySection = false
    const verdict = verdictFor(empty, 'accessibility-published')
    expect(verdict.state).toBe('fail')
    expect(verdict.observation).toContain('once an organiser fills the fields')
  })
})
