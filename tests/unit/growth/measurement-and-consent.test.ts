/**
 * AN1. MEASUREMENT, SO THE MARKETING IS COUNTED BY THE PRODUCT.
 *
 * Nobody can say how the first real organiser found EventLinqs. This file holds
 * the two halves of the answer: what the platform records about an arrival, and
 * the rule that nothing third-party loads until somebody agrees to it.
 *
 * The consent half is written as a rule that must be provably UNABLE to fail
 * open, rather than as a check that it is currently closed. Every failure path
 * through the decoder is enumerated, because a cookie is user-writable and the
 * one direction that matters is the one where a person who said no gets a
 * tracker anyway.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ARRIVAL_COOKIE,
  arrivalIsEmpty,
  arrivalReferrerHost,
  arrivalUtmObject,
  decodeArrival,
  encodeArrival,
  NO_ARRIVAL,
  readArrival,
} from '@/lib/growth/arrival'
import {
  HEARD_FROM_CHOICES,
  HEARD_FROM_OTHER_MAX,
  heardFromLabel,
  isHeardFromValue,
  normaliseHeardFrom,
} from '@/lib/growth/heard-from'
import {
  CONSENT_VERSION,
  NO_CONSENT,
  allGranted,
  allRefused,
  decodeConsent,
  encodeConsent,
  hasDecided,
  mayLoad,
} from '@/lib/analytics/consent'
import { ANALYTICS_HOSTS, ANALYTICS_PROVIDERS, isAnalyticsHost } from '@/lib/analytics/providers'
import { AD_CONVERSIONS, FUNNEL_STEPS, isAdConversion } from '@/lib/analytics/funnel'
import { organiserSignupSourceLine } from '@/lib/growth/signup-sources'

const ROOT = process.cwd()

describe('AN1 acceptance 1: what a signup records about how it arrived', () => {
  it('keeps src, the utm parameters, the landing path and the referrer', () => {
    const arrival = readArrival({
      url: 'https://www.eventlinqs.com.au/organisers?src=organisers&utm_campaign=test&utm_source=instagram',
      referrer: 'https://www.instagram.com/somebody/',
      ownHost: 'www.eventlinqs.com.au',
    })
    expect(arrival.src).toBe('organisers')
    expect(arrival.utmCampaign).toBe('test')
    expect(arrival.utmSource).toBe('instagram')
    expect(arrival.landingPath).toBe('/organisers')
    expect(arrival.referrerHost).toBe('instagram.com')
  })

  it('keeps the path and never the query string', () => {
    // A query can carry a search term or a token. The path is the whole answer
    // to "which page did they land on".
    const arrival = readArrival({ url: 'https://www.eventlinqs.com.au/events/a-night?q=somebodys+search' })
    expect(arrival.landingPath).toBe('/events/a-night')
    expect(JSON.stringify(arrival)).not.toContain('somebodys')
  })

  it('keeps the referring HOST and never the referring URL', () => {
    expect(
      arrivalReferrerHost('https://www.google.com/search?q=a+persons+private+search', 'www.eventlinqs.com.au'),
    ).toBe('google.com')
  })

  it('drops our own host, because an internal click is not a channel', () => {
    expect(arrivalReferrerHost('https://www.eventlinqs.com.au/', 'www.eventlinqs.com.au')).toBeNull()
  })

  it('survives the cookie round trip with every field intact', () => {
    const arrival = readArrival({
      url: 'https://www.eventlinqs.com.au/?src=footer&ref=ABC&utm_source=s&utm_medium=m&utm_campaign=c&utm_term=t&utm_content=n',
      referrer: 'https://news.example.com/story',
      ownHost: 'www.eventlinqs.com.au',
    })
    expect(decodeArrival(encodeArrival(arrival))).toEqual(arrival)
  })

  it('writes nothing when there is nothing to say', () => {
    const organic = readArrival({ url: 'https://www.eventlinqs.com.au/' })
    expect(arrivalIsEmpty(organic)).toBe(true)
  })

  it('answers "we do not know" to a cookie that has been tampered with', () => {
    // A cookie is user-writable and arrives from a public browser.
    for (const bad of ['', 'not-json', encodeURIComponent('"a string"'), encodeURIComponent('[1,2,3]')]) {
      expect(decodeArrival(bad)).toEqual(NO_ARRIVAL)
    }
  })

  it('bounds every field, so a crafted link cannot write a kilobyte', () => {
    const long = 'x'.repeat(5000)
    const arrival = readArrival({ url: `https://www.eventlinqs.com.au/?src=${long}` })
    expect((arrival.src ?? '').length).toBeLessThanOrEqual(120)
  })

  it('stores the utm parameters with absent keys rather than nulls', () => {
    const arrival = readArrival({ url: 'https://www.eventlinqs.com.au/?utm_source=instagram' })
    expect(arrivalUtmObject(arrival)).toEqual({ source: 'instagram' })
    expect(arrivalUtmObject(readArrival({ url: 'https://www.eventlinqs.com.au/' }))).toBeNull()
  })

  it('is captured on the first page of any kind, not only on an event page', () => {
    // The SALE attribution is captured on event pages, which is the right place
    // for it. An organiser can land anywhere, so this one is in the root layout.
    const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('<ArrivalCapture />')
  })

  it('is first touch: the writer only writes when the cookie is absent', () => {
    const capture = readFileSync(join(ROOT, 'src/components/growth/arrival-capture.tsx'), 'utf8')
    expect(capture).toContain(`startsWith(\`\${ARRIVAL_COOKIE}=\`)`)
    expect(capture).toContain('if (already) return')
  })
})

describe('AN1 acceptance 1: the one question', () => {
  it('offers the six choices the item names', () => {
    expect(HEARD_FROM_CHOICES.map(c => c.label)).toEqual([
      'A DJ or promoter I know',
      'Instagram',
      'Google',
      'Another organiser',
      'An event I attended',
      'Other',
    ])
  })

  it('is optional: no answer stores no answer, and nothing is invented', () => {
    expect(normaliseHeardFrom({})).toEqual({ heardFrom: null, heardFromOther: null })
    expect(heardFromLabel(null)).toBe('Not answered')
  })

  it('refuses an answer that is not on the list', () => {
    // The weekly line groups on this column, so one crafted value would put a
    // stranger's sentence into the owner's report.
    expect(isHeardFromValue('<script>')).toBe(false)
    expect(normaliseHeardFrom({ heardFrom: '<script>' }).heardFrom).toBeNull()
  })

  it('keeps the free text only for "other", trimmed and bounded', () => {
    expect(normaliseHeardFrom({ heardFrom: 'other', heardFromOther: '  a friend  ' })).toEqual({
      heardFrom: 'other',
      heardFromOther: 'a friend',
    })
    expect(normaliseHeardFrom({ heardFrom: 'google', heardFromOther: 'ignored' }).heardFromOther).toBeNull()
    const long = normaliseHeardFrom({ heardFrom: 'other', heardFromOther: 'y'.repeat(5000) })
    expect((long.heardFromOther ?? '').length).toBe(HEARD_FROM_OTHER_MAX)
  })

  it('never blocks the signup: the submit path does not read it', () => {
    const form = readFileSync(join(ROOT, 'src/components/auth/signup-form.tsx'), 'utf8')
    // The field is forwarded as undefined when empty and nothing validates it.
    expect(form).toContain('heardFrom: heardFrom || undefined')
    expect(form).not.toMatch(/if \(!heardFrom\)/)
  })

  it('is asked of organisers only, because it is the supply side it is spent on', () => {
    const form = readFileSync(join(ROOT, 'src/components/auth/signup-form.tsx'), 'utf8')
    expect(form).toContain('{isOrganiser && (')
  })
})

describe('AN1 acceptance 2: nothing loads for somebody who has not agreed', () => {
  it('grants nothing before anyone has answered', () => {
    expect(NO_CONSENT.analytics).toBe(false)
    expect(NO_CONSENT.advertising).toBe(false)
    expect(hasDecided(NO_CONSENT)).toBe(false)
  })

  it('refuses every provider on a decision nobody has made', () => {
    for (const provider of ANALYTICS_PROVIDERS) {
      expect(mayLoad({ decision: NO_CONSENT, category: provider.category, identifier: 'configured' })).toBe(false)
    }
  })

  it('refuses a provider with no identifier even after a person accepted', () => {
    // Two conditions, and both of them must hold. An unconfigured provider is
    // not loaded, which is also what makes a tree that has never been given a
    // key a correct tree rather than a broken one.
    for (const provider of ANALYTICS_PROVIDERS) {
      expect(mayLoad({ decision: allGranted(), category: provider.category, identifier: '' })).toBe(false)
      expect(mayLoad({ decision: allGranted(), category: provider.category, identifier: '   ' })).toBe(false)
      expect(mayLoad({ decision: allGranted(), category: provider.category, identifier: undefined })).toBe(false)
    }
  })

  it('loads only once both conditions hold', () => {
    for (const provider of ANALYTICS_PROVIDERS) {
      expect(mayLoad({ decision: allGranted(), category: provider.category, identifier: 'configured' })).toBe(true)
    }
  })

  it('records a refusal, so the question is not asked again', () => {
    const refused = allRefused()
    expect(hasDecided(refused)).toBe(true)
    expect(refused.analytics).toBe(false)
    expect(refused.advertising).toBe(false)
  })

  it('answers "not agreed" on every path a tampered cookie can take', () => {
    const paths: Array<[string, string | null]> = [
      ['absent', null],
      ['empty', ''],
      ['not json', 'garbage'],
      ['not an object', encodeURIComponent('"yes"')],
      ['an array', encodeURIComponent('[1]')],
      ['a stale version', encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION + 1, a: 1, d: 1, t: 'x' }))],
      ['hand written truthy values', encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, a: 'yes', d: true, t: 'x' }))],
    ]
    for (const [name, value] of paths) {
      const decoded = decodeConsent(value)
      expect(decoded.analytics, name).toBe(false)
      expect(decoded.advertising, name).toBe(false)
    }
  })

  it('survives the round trip of a real decision', () => {
    const granted = allGranted(new Date('2026-09-13T00:00:00.000Z'))
    const back = decodeConsent(encodeConsent(granted))
    expect(back.analytics).toBe(true)
    expect(back.advertising).toBe(true)
    expect(back.decidedAt).toBe('2026-09-13T00:00:00.000Z')
  })

  it('a version bump makes every stored decision stale, so the question returns', () => {
    // Consent is to a specific list of providers. Adding one to a category
    // somebody already accepted would extend a permission they never gave.
    const old = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION - 1, a: 1, d: 1, t: 'x' }))
    expect(hasDecided(decodeConsent(old))).toBe(false)
  })
})

describe('AN1: the providers, and the hosts the drive watches for', () => {
  it('names every provider the item asks for', () => {
    expect(ANALYTICS_PROVIDERS.map(p => p.id).sort()).toEqual(['ga4', 'google-ads', 'meta-pixel', 'posthog'])
  })

  it('puts the three that can follow somebody elsewhere in the advertising category', () => {
    const advertising = ANALYTICS_PROVIDERS.filter(p => p.category === 'advertising').map(p => p.id)
    expect(advertising.sort()).toEqual(['ga4', 'google-ads', 'meta-pixel'])
  })

  it('recognises a request to any of them', () => {
    expect(isAnalyticsHost('https://www.googletagmanager.com/gtag/js?id=G-X')).toBe(true)
    expect(isAnalyticsHost('https://connect.facebook.net/en_US/fbevents.js')).toBe(true)
    expect(isAnalyticsHost('https://us.i.posthog.com/static/array.js')).toBe(true)
    expect(isAnalyticsHost('https://www.eventlinqs.com.au/organisers')).toBe(false)
    // Plausible is cookieless and is deliberately outside this list, so the
    // driven proof does not fail the platform for counting its own pages.
    expect(isAnalyticsHost('https://plausible.io/js/script.tagged-events.js')).toBe(false)
  })

  it('gives every provider an identifier only the owner can mint', () => {
    for (const provider of ANALYTICS_PROVIDERS) {
      expect(provider.envVar).toMatch(/^[A-Z0-9_]+$/)
      expect(provider.hosts.length).toBeGreaterThan(0)
    }
    expect(ANALYTICS_HOSTS.length).toBeGreaterThanOrEqual(ANALYTICS_PROVIDERS.length)
  })
})

describe('AN1: the funnel, and the two conversions', () => {
  it('has the five steps the item names, in order', () => {
    expect([...FUNNEL_STEPS]).toEqual([
      'landed',
      'signup_started',
      'signup_completed',
      'event_published',
      'first_sale',
    ])
  })

  it('sends only two of them to the advertising tools', () => {
    // A conversion tag exists to let an ad platform optimise. Giving it every
    // step teaches it to chase a page view.
    expect(AD_CONVERSIONS).toEqual(['signup_completed', 'event_published'])
    expect(isAdConversion('landed')).toBe(false)
    expect(isAdConversion('first_sale')).toBe(false)
  })

  it('fires signup_started on the first keystroke, not on mount', () => {
    // Mount would count everybody who scrolled past the form as having started
    // it, which turns the biggest drop in the funnel into a flat line.
    const form = readFileSync(join(ROOT, 'src/components/auth/signup-form.tsx'), 'utf8')
    expect(form).toContain("trackFunnel('signup_started'")
    expect(form).toContain('if (!funnelStarted) {')
  })

  it('fires signup_completed only after the account exists', () => {
    const form = readFileSync(join(ROOT, 'src/components/auth/signup-form.tsx'), 'utf8')
    const failure = form.indexOf('if (!res.ok || !payload.ok)')
    const completed = form.indexOf("trackFunnel('signup_completed'")
    expect(completed).toBeGreaterThan(failure)
  })

  it('sends the first sale from the server, with no person in it', () => {
    const server = readFileSync(join(ROOT, 'src/lib/analytics/funnel-server.ts'), 'utf8')
    expect(server).toContain('distinct_id: input.organisationId')
    // The BODY only. The docblock names the fields it refuses to send, which is
    // the point of it, so asserting over the whole file would refuse the
    // explanation along with the thing it explains.
    const body = server.slice(server.indexOf('body: JSON.stringify('), server.indexOf('if (!response.ok)'))
    expect(body).not.toMatch(/email|full_name|buyer|name/i)
    // No key, no request: the same default-off posture as every provider.
    expect(server).toContain("if (!key) return { sent: false, reason: 'no PostHog key configured' }")
  })
})

describe('AN1 acceptance 3: the weekly line the digest prints', () => {
  it('says nothing rather than zero when the read failed', () => {
    // "No organisers signed up" and "we could not find out" are different
    // pieces of news and only one of them is about the platform.
    expect(organiserSignupSourceLine({ total: 0, heardFrom: [], surfaces: [], unavailable: true })).toBeNull()
  })

  it('says none when there genuinely were none', () => {
    expect(organiserSignupSourceLine({ total: 0, heardFrom: [], surfaces: [], unavailable: false })).toBe(
      'Organiser signups this week: none.',
    )
  })

  it('leads with the count and names the top three sources', () => {
    const line = organiserSignupSourceLine({
      total: 7,
      heardFrom: [
        { label: 'A DJ or promoter I know', count: 3 },
        { label: 'Instagram', count: 2 },
        { label: 'Not answered', count: 1 },
        { label: 'Google', count: 1 },
      ],
      surfaces: [],
      unavailable: false,
    })
    expect(line).toBe(
      'Organiser signups this week: 7. Heard about us through: A DJ or promoter I know 3, Instagram 2, Not answered 1.',
    )
  })

  it('counts the unanswered rather than hiding them', () => {
    // A question most people skip produces a number that looks authoritative
    // and is a minority report. The denominator is what makes it readable.
    const line = organiserSignupSourceLine({
      total: 4,
      heardFrom: [{ label: 'Not answered', count: 4 }],
      surfaces: [],
      unavailable: false,
    })
    expect(line).toContain('Not answered 4')
  })
})

describe('AN1 acceptance 4: Search Console can verify the property', () => {
  it('renders the verification tag only when the owner has pasted the token', () => {
    // An EMPTY meta tag is worse than none: it looks verified and fails.
    const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('process.env.GOOGLE_SITE_VERIFICATION')
    expect(layout).toContain('? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }')
    expect(layout).toContain(': {}),')
  })

  it('declares the token in the environment manifest', () => {
    const manifest = readFileSync(join(ROOT, 'src/lib/env/manifest.mjs'), 'utf8')
    expect(manifest).toContain("name: 'GOOGLE_SITE_VERIFICATION'")
    for (const provider of ANALYTICS_PROVIDERS) {
      expect(manifest).toContain(`name: '${provider.envVar}'`)
    }
  })
})

describe('AN1: the policies say what the platform now does', () => {
  const cookies = readFileSync(join(ROOT, 'src/app/legal/cookies/page.tsx'), 'utf8')
  const privacy = readFileSync(join(ROOT, 'src/app/legal/privacy/page.tsx'), 'utf8')

  it('no longer claims that no banner is required, because that stopped being true', () => {
    expect(cookies).not.toContain('no cookie consent banner is')
  })

  it('names every provider in both policies', () => {
    for (const name of ['PostHog', 'Google Analytics 4', 'Google Ads', 'Meta']) {
      expect(cookies, `cookies: ${name}`).toContain(name)
      expect(privacy, `privacy: ${name}`).toContain(name)
    }
  })

  it('tells a person how to change their mind', () => {
    expect(cookies).toContain('el_consent')
    expect(privacy).toContain('el_consent')
  })

  it('names the consent cookie it actually sets', () => {
    expect(ARRIVAL_COOKIE).toBe('el_arrival')
    expect(cookies).toContain('el_consent')
  })
})
