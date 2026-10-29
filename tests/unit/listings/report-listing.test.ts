import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { judgeRemovalRequest, recordRemovalRequest, REMOVAL_REASONS } from '@/lib/listings/removal-request'
import { removalItem } from '@/lib/admin/today-math'

/*
 * REPORT OR REMOVE THIS LISTING (the release checklist's I5; the project manager's ruling of 29 October 2026, 14:20):
 * a link on every event page to a form with no account, one reason and an optional email, rate limited by address,
 * a hidden field for form robots, one removal_requests row for /admin/today, and nothing hidden or deleted by it.
 */

describe('the judgement', () => {
  it('takes each of the five reasons in its stored words, with no email', () => {
    for (const r of REMOVAL_REASONS) {
      expect(judgeRemovalRequest({ reason: r.key, email: '' })).toEqual({ ok: true, reason: r.words, email: null })
    }
  })

  it('keeps an email that is one, trimmed', () => {
    expect(judgeRemovalRequest({ reason: 'wrong', email: '  host@example.com ' })).toEqual({ ok: true, reason: 'The details are wrong', email: 'host@example.com' })
  })

  it('refuses no reason, a reason not on the list, and an email that is not one', () => {
    expect(judgeRemovalRequest({ reason: '', email: '' }).ok).toBe(false)
    expect(judgeRemovalRequest({ reason: 'delete everything', email: '' }).ok).toBe(false)
    expect(judgeRemovalRequest({ reason: 'mine', email: 'not an address' }).ok).toBe(false)
  })
})

describe('the write', () => {
  it('is one row naming the night, with no name, and nothing else', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const from = vi.fn(() => ({ insert }))
    const done = await recordRemovalRequest({ from } as never, 'ev-1', { reason: 'The details are wrong', email: null })
    expect(done).toEqual({ state: 'done' })
    expect(from).toHaveBeenCalledWith('removal_requests')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0]).toEqual([
      expect.objectContaining({ event_id: 'ev-1', reason: 'The details are wrong', requester_email: null, requester_name: null }),
    ])
  })

  it("answers the database's refusal in words, never as sent", async () => {
    const from = () => ({ insert: async () => ({ error: { message: 'violates check constraint' } }) })
    const done = await recordRemovalRequest({ from } as never, 'ev-1', { reason: 'x', email: null })
    expect(done.state).toBe('refused')
  })
})

/* The action, with its edges stood in for: redirect throws as Next's does, so each answer is read from where it goes. */
const redirects: string[] = []
const rateOk = { ok: true }
const rate = vi.fn(async () => rateOk)
const insert = vi.fn(async () => ({ error: null }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    redirects.push(to)
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }) }))
vi.mock('@/lib/redis/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => rate(...(a as [])), clientIp: () => '203.0.113.9' }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://www.eventlinqs.com.au' }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }))
vi.mock('@/app/events/[slug]/report/reportable', () => ({
  reportableEvent: async (_db: unknown, slug: string) => (slug === 'a-night' ? { id: 'ev-1', title: 'A Night', slug } : null),
}))

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

describe('the form action', () => {
  beforeEach(() => {
    redirects.length = 0
    insert.mockClear()
    rate.mockClear()
    rateOk.ok = true
  })

  async function send(entries: Record<string, string>) {
    const { reportListing } = await import('@/app/events/[slug]/report/actions')
    await reportListing(form(entries)).catch(() => {})
    return redirects[0]
  }

  it('writes one row and answers sent', async () => {
    expect(await send({ slug: 'a-night', reason: 'not_on', email: '' })).toBe('/events/a-night/report?sent=1#report')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(rate).toHaveBeenCalledWith(expect.objectContaining({ key: 'listing-rep:203.0.113.9', limit: 5, windowSec: 600 }))
  })

  it('answers a form robot as sent and writes nothing', async () => {
    expect(await send({ slug: 'a-night', reason: 'not_on', email: '', website: 'http://spam.example' })).toBe('/events/a-night/report?sent=1#report')
    expect(insert).not.toHaveBeenCalled()
  })

  it('writes nothing past the limit, and says why', async () => {
    rateOk.ok = false
    expect(await send({ slug: 'a-night', reason: 'not_on', email: '' })).toMatch(/^\/events\/a-night\/report\?problem=Too%20many/)
    expect(insert).not.toHaveBeenCalled()
  })

  it('writes nothing for a night no visitor can see', async () => {
    expect(await send({ slug: 'a-draft', reason: 'not_on', email: '' })).toBe('/events')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('every event page carries the link', () => {
  it('the event page and the walk-in page both draw it, and the form is never indexed', () => {
    for (const file of ['src/app/events/[slug]/page.tsx', 'src/components/events/walk-in/walk-in-event-page.tsx']) {
      expect(readFileSync(file, 'utf8')).toMatch(/<ReportListingLink slug=\{event\.slug\} \/>/)
    }
    expect(readFileSync('src/components/events/report-listing-link.tsx', 'utf8')).toMatch(/Report or remove this listing/)
    expect(readFileSync('src/app/events/[slug]/report/page.tsx', 'utf8')).toMatch(/robots: \{ index: false, follow: false \}/)
  })
})

describe('/admin/today names a reported night', () => {
  const base = { id: 'r1', reason: 'It is cancelled or not happening', created_at: '2026-10-29T04:00:00Z', venues: null, event_series: null }

  it('with no name, by its title, linked to the night', () => {
    const item = removalItem({ ...base, requester_name: null, requester_email: null, events: { title: 'Thursday Trivia', slug: 'thursday-trivia' } })
    expect(item.what).toBe('Someone asks for Thursday Trivia to be taken down')
    expect(item.href).toBe('/events/thursday-trivia')
  })

  it('with the email when one was given, and a venue request as before', () => {
    expect(removalItem({ ...base, requester_name: null, requester_email: 'a@b.co', events: [{ title: 'X', slug: 'x' }] }).what).toBe('Someone (a@b.co) asks for X to be taken down')
    const venue = removalItem({ ...base, requester_name: 'A Host', requester_email: 'h@x.co', venues: { name: 'The Venue' }, events: null })
    expect(venue.what).toBe('A Host asks for The Venue to be taken down')
    expect(venue.href).toBeNull()
  })
})
