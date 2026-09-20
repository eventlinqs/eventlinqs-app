import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  SOURCE_CATEGORY,
  SOURCE_CATEGORY_COUNTS,
  SOURCE_CATEGORY_DIGEST,
  SOURCE_CATEGORY_FETCHED_ON,
  SOURCE_CATEGORY_PROVENANCE,
} from '@/lib/growth/source-categories.generated'
import {
  TRAFFIC_CHANNELS,
  TRAFFIC_CHANNEL_COPY,
  categoryForHost,
  channelForVisit,
  sourceTokenForHost,
  type TrafficChannel,
} from '@/lib/growth/traffic-channel'
import {
  TRAFFIC_WINDOWS,
  parseWindow,
  summariseTraffic,
  windowLabel,
} from '@/lib/growth/organic-reach-math'

/**
 * CLOSE-OUT AQ3, LANE B'S HALF: organic search counted separately from direct.
 *
 * The test that matters most in this file is the first one, and it is the trap
 * the whole feature was nearly built into: Google's published table carries the
 * bare token `google` and no entry for `google.com.au`, so a host matched
 * straight against the table classifies every visit Google sends us as a
 * referral. That would produce a page reporting, confidently and permanently,
 * that search brings nobody.
 */

describe('the host a search engine actually arrives as', () => {
  const searchHosts = [
    'google.com.au',
    'www.google.com.au',
    'google.com',
    'www.google.com',
    'news.google.com',
    'bing.com',
    'www.bing.com',
    'duckduckgo.com',
    'au.search.yahoo.com',
    'ecosia.org',
    'www.ecosia.org',
  ]

  it.each(searchHosts)('%s is organic search, not a referral', host => {
    expect(categoryForHost(host)).toBe('search')
    expect(channelForVisit({ referrer: host, utmSource: null, utmMedium: null, utmCampaign: null })).toBe(
      'organic-search',
    )
  })

  it('reduces a host to the source name Google publishes, not to the host', () => {
    // The whole point: google.com.au is in no published list, `google` is.
    expect(sourceTokenForHost('www.google.com.au')).toBe('google')
    expect(sourceTokenForHost('images.google.co.uk')).toBe('google')
  })

  it('prefers an exact published entry over the reduction', () => {
    // Google publishes m.facebook.com and l.facebook.com in their own right, so
    // they are taken whole rather than reduced to `facebook`. Same answer here,
    // and it is the rule that keeps a host with its own row from being guessed
    // at from one of its labels.
    expect(sourceTokenForHost('m.facebook.com')).toBe('m.facebook.com')
    expect(sourceTokenForHost('au.search.yahoo.com')).toBe('au.search.yahoo.com')
    expect(sourceTokenForHost('t.co')).toBe('t.co')
    expect(categoryForHost('m.facebook.com')).toBe('social')
  })

  it('reduces a facebook subdomain Google does not publish', () => {
    expect(sourceTokenForHost('share.facebook.com')).toBe('facebook')
    expect(categoryForHost('share.facebook.com')).toBe('social')
  })

  it('accepts a full URL as well as a bare host, because a caller may hold either', () => {
    expect(sourceTokenForHost('https://www.google.com.au/search?q=gigs')).toBe('google')
    expect(sourceTokenForHost('http://www.google.com.au/')).toBe('google')
  })

  it('names nothing it cannot find, so an unknown site stays a referral', () => {
    expect(sourceTokenForHost('search.brave.com')).toBeNull()
    expect(sourceTokenForHost('some-venue.com.au')).toBeNull()
    expect(sourceTokenForHost('')).toBeNull()
    expect(sourceTokenForHost(null)).toBeNull()
    expect(
      channelForVisit({ referrer: 'some-venue.com.au', utmSource: null, utmMedium: null, utmCampaign: null }),
    ).toBe('referral')
  })

  it('does not match a brand name that merely appears inside a label', () => {
    expect(sourceTokenForHost('notgoogle.com')).toBeNull()
    expect(sourceTokenForHost('google-tickets-blog.com')).toBeNull()
  })
})

describe('direct means nothing was recorded, and only that', () => {
  it('is direct when there is no referrer and no campaign label at all', () => {
    expect(channelForVisit({ referrer: null, utmSource: null, utmMedium: null, utmCampaign: null })).toBe('direct')
    expect(channelForVisit({ referrer: '', utmSource: '', utmMedium: '', utmCampaign: '' })).toBe('direct')
  })

  it('is never direct once anything at all was recorded', () => {
    expect(channelForVisit({ referrer: null, utmSource: null, utmMedium: null, utmCampaign: 'spring' })).not.toBe(
      'direct',
    )
    expect(channelForVisit({ referrer: 'example.com', utmSource: null, utmMedium: null, utmCampaign: null })).not.toBe(
      'direct',
    )
  })
})

describe('the published rules, in the published order', () => {
  it('a bought search click is paid search, not organic search', () => {
    expect(channelForVisit({ referrer: 'google.com.au', utmSource: null, utmMedium: 'cpc', utmCampaign: 'launch' })).toBe(
      'paid-search',
    )
    expect(channelForVisit({ referrer: 'google.com.au', utmSource: null, utmMedium: 'ppc', utmCampaign: null })).toBe(
      'paid-search',
    )
    expect(channelForVisit({ referrer: 'google.com.au', utmSource: null, utmMedium: 'paid-search', utmCampaign: null })).toBe(
      'paid-search',
    )
  })

  it('social sits above email, which is where Google puts it', () => {
    // A rebuild that checked email first would quietly disagree with every
    // other tool this is ever compared against.
    expect(
      channelForVisit({ referrer: 'instagram.com', utmSource: null, utmMedium: 'email', utmCampaign: null }),
    ).toBe('organic-social')
  })

  it('classifies the platform own recovery emails as email', () => {
    // src/lib/recovery/links.ts: utm_source=eventlinqs&utm_medium=email
    expect(
      channelForVisit({ referrer: null, utmSource: 'eventlinqs', utmMedium: 'email', utmCampaign: 'recover-7' }),
    ).toBe('email')
  })

  it('reads medium=organic as organic search even with no referring site', () => {
    expect(channelForVisit({ referrer: null, utmSource: null, utmMedium: 'organic', utmCampaign: null })).toBe(
      'organic-search',
    )
  })

  it('separates video, display and a bought click that names no site', () => {
    expect(channelForVisit({ referrer: 'youtube.com', utmSource: null, utmMedium: null, utmCampaign: null })).toBe(
      'organic-video',
    )
    expect(channelForVisit({ referrer: 'youtube.com', utmSource: null, utmMedium: 'cpc', utmCampaign: null })).toBe(
      'paid-video',
    )
    expect(channelForVisit({ referrer: null, utmSource: null, utmMedium: 'banner', utmCampaign: null })).toBe('display')
    expect(channelForVisit({ referrer: null, utmSource: 'somewhere', utmMedium: 'cpc', utmCampaign: null })).toBe(
      'paid-other',
    )
  })

  it('falls to unassigned only when something was recorded and no rule fits', () => {
    expect(channelForVisit({ referrer: null, utmSource: null, utmMedium: null, utmCampaign: 'spring-2026' })).toBe(
      'unassigned',
    )
  })

  it('takes a campaign source name straight from the published table', () => {
    expect(channelForVisit({ referrer: null, utmSource: 'google', utmMedium: null, utmCampaign: 'x' })).toBe(
      'organic-search',
    )
  })
})

describe('every channel can be named on a screen', () => {
  it('has a label and an explanation for each channel, and no spares', () => {
    const copyKeys = Object.keys(TRAFFIC_CHANNEL_COPY).sort()
    expect(copyKeys).toEqual([...TRAFFIC_CHANNELS].sort())
    for (const channel of TRAFFIC_CHANNELS) {
      expect(TRAFFIC_CHANNEL_COPY[channel].label.length).toBeGreaterThan(0)
      expect(TRAFFIC_CHANNEL_COPY[channel].meaning.length).toBeGreaterThan(0)
    }
  })

  it('lists organic search and direct first, because that is the question', () => {
    expect(TRAFFIC_CHANNELS[0]).toBe('organic-search')
    expect(TRAFFIC_CHANNELS[1]).toBe('direct')
  })
})

describe('the counting', () => {
  const visit = (referrer: string | null) => ({ referrer, utmSource: null, utmMedium: null, utmCampaign: null })
  const sale = (referrer: string | null, orderKey: string, quantity: number) => ({
    ...visit(referrer),
    orderKey,
    quantity,
  })

  it('counts one order however many ticket types it holds', () => {
    const summary = summariseTraffic(
      [visit('google.com.au')],
      [sale('google.com.au', 'order-1', 2), sale('google.com.au', 'order-1', 1)],
    )
    expect(summary.organicSearch.orders).toBe(1)
    expect(summary.organicSearch.tickets).toBe(3)
  })

  it('keeps organic search and direct apart in the same window', () => {
    const summary = summariseTraffic(
      [visit('google.com.au'), visit('google.com.au'), visit(null), visit(null), visit(null)],
      [sale('google.com.au', 'order-1', 1), sale(null, 'order-2', 4)],
    )
    expect(summary.organicSearch).toMatchObject({ visits: 2, orders: 1, tickets: 1 })
    expect(summary.direct).toMatchObject({ visits: 3, orders: 1, tickets: 4 })
    expect(summary.totals).toMatchObject({ visits: 5, orders: 2, tickets: 5 })
  })

  it('reports no visits as null rather than as a zero rate', () => {
    const summary = summariseTraffic([], [])
    expect(summary.organicSearch.ordersPerHundredVisits).toBeNull()
    expect(summary.totals.ordersPerHundredVisits).toBeNull()
  })

  it('reports a real zero when people arrived and nobody bought', () => {
    const summary = summariseTraffic([visit('google.com.au'), visit('google.com.au')], [])
    expect(summary.organicSearch.ordersPerHundredVisits).toBe(0)
  })

  it('computes orders per hundred visits to one decimal', () => {
    const visits = Array.from({ length: 8 }, () => visit('google.com.au'))
    const summary = summariseTraffic(visits, [sale('google.com.au', 'order-1', 1)])
    expect(summary.organicSearch.ordersPerHundredVisits).toBe(12.5)
  })

  it('splits the channels into the ones with something and the ones without', () => {
    const summary = summariseTraffic([visit('google.com.au')], [])
    expect(summary.active.map(row => row.channel)).toEqual(['organic-search'])
    expect(summary.silent).toContain('direct')
    expect(summary.active.length + summary.silent.length).toBe(TRAFFIC_CHANNELS.length)
  })

  it('always returns every channel, so a surface cannot invent one', () => {
    const summary = summariseTraffic([], [])
    expect(summary.byChannel.map(row => row.channel)).toEqual([...TRAFFIC_CHANNELS])
  })
})

describe('the window', () => {
  it('offers the four windows and names each one', () => {
    expect([...TRAFFIC_WINDOWS]).toEqual([7, 30, 90, 0])
    expect(windowLabel(7)).toBe('Last 7 days')
    expect(windowLabel(0)).toBe('All time')
  })

  it('falls back to thirty days rather than throwing on rubbish', () => {
    expect(parseWindow('7')).toBe(7)
    expect(parseWindow('0')).toBe(0)
    expect(parseWindow('nonsense')).toBe(30)
    expect(parseWindow(null)).toBe(30)
    expect(parseWindow('1000')).toBe(30)
  })
})

describe('the published table is the published table', () => {
  it('carries its own provenance beside the data', () => {
    expect(SOURCE_CATEGORY_PROVENANCE.rules).toMatch(/^https:\/\/support\.google\.com\//)
    expect(SOURCE_CATEGORY_PROVENANCE.table).toMatch(/^https:\/\//)
    expect(SOURCE_CATEGORY_FETCHED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches the digest it was sealed with', () => {
    const canonical = Object.keys(SOURCE_CATEGORY)
      .sort()
      .map(name => `${name}=${SOURCE_CATEGORY[name]}`)
      .join('\n')
    expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(SOURCE_CATEGORY_DIGEST)
  })

  it('matches the counts it recorded', () => {
    const counts = { search: 0, social: 0, shopping: 0, video: 0 }
    for (const category of Object.values(SOURCE_CATEGORY)) counts[category] += 1
    expect(counts).toEqual(SOURCE_CATEGORY_COUNTS)
  })

  it('still holds the search engines this platform depends on', () => {
    for (const token of ['google', 'bing', 'duckduckgo', 'yahoo']) {
      expect(SOURCE_CATEGORY[token]).toBe('search')
    }
  })
})

describe('the two meanings of the word organic never meet', () => {
  /**
   * `src/lib/growth/attribution-analytics.ts` already uses `organic` to mean
   * "this signup came through no referral of ours", which is a different claim
   * from "a search engine sent this visit". They are both correct in their own
   * file and they must never be the same string, or a reader will add two
   * numbers that do not go together.
   */
  it('this module never emits the bare word organic as a channel', () => {
    const channels: TrafficChannel[] = [...TRAFFIC_CHANNELS]
    expect(channels).not.toContain('organic' as TrafficChannel)
    expect(channels.filter(c => c.startsWith('organic-')).length).toBeGreaterThan(0)
  })
})
