/**
 * The daily sales digest. Close-out MONEY FIX, part B, step B4.
 *
 * `daily` is the DEFAULT mode, so this sweep is the difference between the
 * default meaning "you hear about your sales once a day" and the default
 * meaning "you hear about the first one and then nothing".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildDigestEmail,
  platformDayBounds,
  previousPlatformDay,
} from '@/lib/notifications/organiser-sales-digest'

describe('the platform day the digest reports on', () => {
  it('reports the day that has just finished, in the platform zone', () => {
    // 07:10 UTC on 18 September is 17:10 in Melbourne on the 18th (AEST, +10),
    // so the day that has just finished is the 17th.
    expect(previousPlatformDay(new Date('2026-09-18T07:10:00Z'))).toBe('2026-09-17')
  })

  it('uses the platform zone rather than UTC, which is a different day at this hour', () => {
    // 14:30 UTC on 18 September is 00:30 on the 19th in Melbourne. The platform
    // day that just finished is therefore the 18th, not the 17th that a naive
    // UTC "yesterday" would report.
    expect(previousPlatformDay(new Date('2026-09-18T14:30:00Z'))).toBe('2026-09-18')
    // The naive answer, recorded so the difference is visible rather than
    // asserted in prose.
    expect(new Date('2026-09-18T14:30:00Z').toISOString().slice(0, 10)).toBe('2026-09-18')
  })

  it('bounds a platform day as a 24 hour window starting at local midnight', () => {
    const { startIso, endIso } = platformDayBounds('2026-09-17')
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(24 * 60 * 60 * 1000)
    // AEST is +10, so local midnight on the 17th is 14:00 UTC on the 16th.
    expect(startIso).toBe('2026-09-16T14:00:00.000Z')
  })

  it('bounds a day inside daylight saving too, without losing or repeating an hour', () => {
    // AEDT is +11 in January, so local midnight is 13:00 UTC the day before.
    const { startIso, endIso } = platformDayBounds('2026-01-15')
    expect(startIso).toBe('2026-01-14T13:00:00.000Z')
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe('the digest copy', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eventlinqs.com.au')
  })

  const rows = [
    {
      orderNumber: 'EL-9HE57YNV',
      eventTitle: 'Afro-Fusion Music Showcase',
      totalCents: 3600,
      currency: 'AUD',
    },
    {
      orderNumber: 'EL-UGPM3FQV',
      eventTitle: 'Afro-Fusion Music Showcase',
      totalCents: 1800,
      currency: 'AUD',
    },
  ]

  it('adds up to the gross it was given and lists every order', () => {
    const { subject, text } = buildDigestEmail({
      day: '2026-09-10',
      rows,
      grossCents: 5400,
      currency: 'AUD',
    })
    expect(subject).toContain('2 sales')
    expect(subject).toContain('$54.00')
    expect(text).toContain('EL-9HE57YNV')
    expect(text).toContain('EL-UGPM3FQV')
    expect(text).toContain('$36.00')
    expect(text).toContain('$18.00')
  })

  it('says one sale in the singular', () => {
    const { subject } = buildDigestEmail({
      day: '2026-09-10',
      rows: rows.slice(0, 1),
      grossCents: 3600,
      currency: 'AUD',
    })
    expect(subject).toContain('1 sale,')
    expect(subject).not.toContain('1 sales')
  })

  it('obeys the copy laws', () => {
    const { subject, html, text } = buildDigestEmail({
      day: '2026-09-10',
      rows,
      grossCents: 5400,
      currency: 'AUD',
    })
    const EN_DASH = String.fromCharCode(0x2013)
    const EM_DASH = String.fromCharCode(0x2014)
    for (const body of [subject, text, html]) {
      expect(body).not.toContain(EN_DASH)
      expect(body).not.toContain(EM_DASH)
      expect(body).not.toContain('!')
      expect(body.toLowerCase()).not.toContain('culture')
    }
  })

  it('escapes an event title so a quote in it cannot break the markup', () => {
    const { html } = buildDigestEmail({
      day: '2026-09-10',
      rows: [{ ...rows[0], eventTitle: 'Rock & "Roll" <b>night</b>' }],
      grossCents: 3600,
      currency: 'AUD',
    })
    expect(html).not.toContain('<b>night</b>')
    expect(html).toContain('&amp;')
  })
})

describe('the digest sweep', () => {
  it('claims the day BEFORE it sends, so a retry cannot send twice', async () => {
    // Read from source rather than driven here: the ordering is the whole
    // idempotency argument and it is cheap to assert that it has not been
    // swapped, which is the edit a later refactor would plausibly make.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/notifications/organiser-sales-digest.ts', 'utf8')
    const claimAt = src.indexOf("from('organiser_sales_digest_sends')")
    const sendAt = src.indexOf('await sendEmail(')
    expect(claimAt).toBeGreaterThan(-1)
    expect(sendAt).toBeGreaterThan(-1)
    expect(claimAt).toBeLessThan(sendAt)
  })

  it('selects only organisations on the daily preference', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/notifications/organiser-sales-digest.ts', 'utf8')
    // 'immediate' already heard about each sale; 'off' asked not to hear.
    expect(src).toContain(".eq('sales_notification_mode', 'daily')")
  })
})

// ---------------------------------------------------------------------------
// A DROPPED SOCKET USED TO SPEND A DAY OF SOMEBODY'S DIGEST, PERMANENTLY.
//
// Found 21 September 2026 by the adversarial pass over LC-BLINK, in the caller
// the read fix had not looked at. The sweep CLAIMS the day by appending to
// `organiser_sales_digest_sends` before it sends, deliberately, so that a crash
// costs one digest rather than sending a duplicate money summary. That ordering
// is right. What was wrong is that two READS sat after the claim: the owner's
// address and the event titles, and both of them raise when a read cannot be
// made.
//
// So one blinked read spent the day, landed in the per-organisation catch, and
// the organiser never got that digest and never would: the next run finds the
// claim row and counts it as already sent. A transient fault became a permanent
// hole in somebody's money summary, and the only trace was one counter moving.
//
// Every read is before the claim now. A read writes nothing, so a run that gives
// up before the claim leaves the day unclaimed and the next run does it properly.

describe('a read the digest could not make', () => {
  it('leaves the day unclaimed, so the next run can still send it', async () => {
    const claims: Record<string, unknown>[] = []
    let recipientReads = 0

    const admin = {
      from(table: string) {
        // The pagers in this module read until a page comes back short, so the
        // fake has to honour `range` or the first page repeats for ever. The
        // first version of this test did not, and the sweep gave up at 200,000
        // rows, which reads exactly like a product fault and is the harness.
        let page = 0
        const api = {
          select: () => api,
          eq: () => api,
          gte: () => api,
          lt: () => api,
          in: () => api,
          order: () => api,
          range: (fromRow: number) => {
            page = fromRow
            return api
          },
          insert: (payload: Record<string, unknown>) => {
            if (table === 'organiser_sales_digest_sends') claims.push(payload)
            return Promise.resolve({ data: null, error: null })
          },
          maybeSingle: async () => {
            if (table === 'organisations') {
              // The resolver's read. It blinks, every attempt, which is what a
              // dropped keep-alive socket does.
              recipientReads += 1
              return { data: null, error: { message: 'fetch failed', name: 'SocketError' } }
            }
            return { data: null, error: null }
          },
          then(resolve: (v: unknown) => void) {
            if (page > 0) {
              // Past the first page every read is exhausted, which is how the
              // pagers know to stop.
              resolve({ data: [], error: null })
              return
            }
            if (table === 'organisations') {
              // The sweep's own list of organisations on daily mode.
              resolve({ data: [{ id: 'org-1', name: 'Lane C Presents' }], error: null })
              return
            }
            if (table === 'orders') {
              resolve({
                data: [
                  {
                    id: 'o-1',
                    order_number: 'EL-1',
                    total_cents: 3500,
                    currency: 'AUD',
                    event_id: 'e-1',
                    confirmed_at: '2026-09-17T03:00:00Z',
                  },
                ],
                error: null,
              })
              return
            }
            resolve({ data: [], error: null })
          },
        }
        return api
      },
    } as never

    const { runOrganiserSalesDigest } = await import('@/lib/notifications/organiser-sales-digest')
    const summary = await runOrganiserSalesDigest(admin, new Date('2026-09-18T07:10:00Z'))

    // The read was attempted and retried rather than believed.
    expect(recipientReads).toBeGreaterThan(1)
    // The organisation was considered and the run did not fall over.
    expect(summary.organisationsConsidered).toBe(1)
    expect(summary.sent).toBe(0)
    // THE WHOLE POINT: no claim row, so tomorrow's run is still able to send it.
    expect(claims).toHaveLength(0)
  })
})
