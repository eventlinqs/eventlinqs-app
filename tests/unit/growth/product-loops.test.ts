import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LOOP_SOURCES,
  ORGANISER_PATH,
  RUN_YOUR_EVENT_CALL,
  RUN_YOUR_EVENT_LEAD,
  RUN_YOUR_EVENT_LINE,
  organiserLoopPath,
  organiserLoopUrl,
  organiserReferralUrl,
  sharedEventUrl,
  withShareSource,
} from '@/lib/growth/loops'
import { decodeRefCode, REF_PARAM, SOURCE_PARAM } from '@/lib/growth/referrals'
import { organiserSignupSourceLine } from '@/lib/growth/signup-sources'

/**
 * CLOSE-OUT PL1. THE TWO PRODUCT LOOPS.
 *
 * Every attendee who buys a ticket has just seen the product work, and every
 * organiser who publishes has friends who run events. These hold the part of
 * that a machine can hold: that every link carries the parameter the count
 * depends on, that the referral link resolves back to the person who sent it,
 * and that the weekly line says what the loop actually produced.
 *
 * The rest is driven, because a link in a unit test is a link nobody clicked.
 */

const ROOT = process.cwd()
const SITE = 'https://www.eventlinqs.com.au'
const A_PROFILE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('PL1 acceptance 1: the run-your-event line and where it points', () => {
  it('is one sentence, assembled from its two halves and never retyped', () => {
    expect(RUN_YOUR_EVENT_LINE).toBe(`${RUN_YOUR_EVENT_LEAD} ${RUN_YOUR_EVENT_CALL}`)
    expect(RUN_YOUR_EVENT_LEAD).toBe('Do you run events?')
    expect(RUN_YOUR_EVENT_CALL).toBe('Publish yours in ten minutes')
  })

  it('carries BOTH parameter systems on every loop link', () => {
    for (const source of Object.values(LOOP_SOURCES)) {
      const path = organiserLoopPath(source)
      expect(path, source).toContain(`${ORGANISER_PATH}?`)
      expect(path, source).toContain(`src=${source}`)
      expect(path, source).toContain(`${SOURCE_PARAM}=`)
    }
  })

  it('names the ticket footer and the confirmation page by the values PL1 names', () => {
    expect(organiserLoopPath(LOOP_SOURCES.TICKET)).toContain('src=ticket')
    expect(organiserLoopPath(LOOP_SOURCES.CONFIRMATION)).toContain('src=confirmation')
  })

  it('is relative in the application and absolute only where there is no page to be relative to', () => {
    expect(organiserLoopPath(LOOP_SOURCES.CONFIRMATION).startsWith('/')).toBe(true)
    expect(organiserLoopUrl(SITE, LOOP_SOURCES.TICKET)).toBe(`${SITE}${organiserLoopPath(LOOP_SOURCES.TICKET)}`)
  })

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(organiserLoopUrl(`${SITE}/`, LOOP_SOURCES.TICKET)).toBe(organiserLoopUrl(SITE, LOOP_SOURCES.TICKET))
  })
})

describe('PL1 acceptance 2: a shared event link carries the share source', () => {
  it('adds src=share to the attributed long link', () => {
    const url = new URL(sharedEventUrl(`${SITE}/events/a-night`))
    expect(url.searchParams.get('src')).toBe(LOOP_SOURCES.SHARE)
    expect(url.searchParams.get(SOURCE_PARAM)).toBe('share-a-ticket')
  })

  it('keeps the sharer on the link when there is one', () => {
    const url = new URL(sharedEventUrl(`${SITE}/events/a-night`, { refCode: 'abc123' }))
    expect(url.searchParams.get(REF_PARAM)).toBe('abc123')
    expect(url.searchParams.get('src')).toBe(LOOP_SOURCES.SHARE)
  })

  it('tags a tracked short link without rebuilding it', () => {
    const short = `${SITE}/s/9fk2`
    const tagged = new URL(withShareSource(short))
    expect(tagged.pathname).toBe('/s/9fk2')
    expect(tagged.searchParams.get('src')).toBe(LOOP_SOURCES.SHARE)
  })

  it('returns anything it cannot parse untouched, because a share button that throws is worse', () => {
    expect(withShareSource('not a url at all')).toBe('not a url at all')
  })

  it('never adds the parameter twice', () => {
    const once = withShareSource(`${SITE}/events/a-night`)
    expect(withShareSource(once)).toBe(once)
  })
})

describe('PL1 acceptance 3: the organiser referral link resolves back to the organiser', () => {
  it('round trips: the code on the link decodes to the profile that owns it', () => {
    const url = organiserReferralUrl(SITE, A_PROFILE)
    expect(url).not.toBeNull()
    const code = new URL(url as string).searchParams.get(REF_PARAM)
    expect(decodeRefCode(code)).toBe(A_PROFILE)
  })

  it('carries its own src, so the weekly line can tell it from the other four', () => {
    const url = new URL(organiserReferralUrl(SITE, A_PROFILE) as string)
    expect(url.searchParams.get('src')).toBe(LOOP_SOURCES.ORGANISER_REFERRAL)
  })

  it('is null rather than a link to nowhere when the id cannot be encoded', () => {
    expect(organiserReferralUrl(SITE, 'not-a-uuid')).toBeNull()
  })
})

describe('PL1 acceptance 3: the weekly line counts what the loop produced', () => {
  const base = { heardFrom: [{ label: 'Instagram', count: 2 }], surfaces: [], unavailable: false }

  it('names the referred count when there is one', () => {
    const line = organiserSignupSourceLine({ ...base, total: 5, referred: 2 })
    expect(line).toContain('Organiser signups this week: 5')
    expect(line).toContain('2 came through an organiser referral link')
  })

  it('says nothing about referrals rather than saying zero', () => {
    const line = organiserSignupSourceLine({ ...base, total: 5, referred: 0 })
    expect(line).not.toContain('referral')
  })

  it('still says nothing at all when the read failed', () => {
    expect(organiserSignupSourceLine({ ...base, total: 5, referred: 2, unavailable: true })).toBeNull()
  })
})

describe('PL1: the surfaces build their links through the one builder', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

  it('the confirmation prompt sits BELOW the ticket, never above it', () => {
    const page = read('src/app/orders/[order_id]/confirmation/page.tsx')
    // The LAST thing the ticket block prints, so "below the ticket" is measured
    // against the end of the ticket rather than the start of it.
    const ticket = page.lastIndexOf('<TransferTicketForm')
    const prompt = page.indexOf('data-loop="organiser-invite"')
    expect(ticket, 'the ticket block should be on this page').toBeGreaterThan(-1)
    expect(prompt, 'the prompt should come after the ticket').toBeGreaterThan(ticket)
  })

  it('the ticket email footer link is composed, not typed', () => {
    const email = read('src/lib/email/order-confirmation.ts')
    expect(email).toContain('organiserLoopUrl(siteUrl, LOOP_SOURCES.TICKET)')
    // Both bodies, because a buyer on a plain-text client is still a buyer.
    expect(email.split('organiserLoopUrl(siteUrl, LOOP_SOURCES.TICKET)').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('the share card names the same path as everything else', () => {
    expect(read('src/lib/broadcast/social-cards.tsx')).toContain('ORGANISER_PATH')
  })

  it('the signup writes the referrer only after confirming they exist', () => {
    const route = read('src/app/api/auth/signup/route.ts')
    expect(route).toContain('referred_by: referredBy')
    // The FK would take AN1's six arrival fields down with it otherwise.
    expect(route).toContain("from('profiles').select('id').eq('id', claimedReferrer)")
  })
})
