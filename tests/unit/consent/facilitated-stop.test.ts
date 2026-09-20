import { describe, expect, test } from 'vitest'
import {
  addressesStoppedForFacilitatedMail,
  decideFacilitatedStop,
  type FacilitatedStopConsent,
  type FacilitatedStopSuppression,
} from '@/lib/consent/facilitated-stop'

/**
 * WHO HAS TOLD THIS PLATFORM TO STOP.
 *
 * The defect these pin: a person who unsubscribed was told the withdrawal
 * covered "every EventLinqs facilitated message on every channel", and the
 * abandoned-checkout recovery sender never asked the consent ledger, so the
 * sentence was false. Measured on TEST on 20 September 2026: 147 people carried
 * a suppression event and the sender's own list held 19 rows.
 */

const MARCH = '2026-03-01T00:00:00.000Z'
const JUNE = '2026-06-01T00:00:00.000Z'
const SEPTEMBER = '2026-09-01T00:00:00.000Z'

function stop(
  over: Partial<FacilitatedStopSuppression> = {},
): FacilitatedStopSuppression {
  return { channel: 'both', scope: 'all_marketing', occurredAt: JUNE, ...over }
}

function grant(over: Partial<FacilitatedStopConsent> = {}): FacilitatedStopConsent {
  return { decision: 'granted', channelScope: 'both', occurredAt: MARCH, ...over }
}

describe('decideFacilitatedStop: has this person said stop, and not since said start again', () => {
  test('no suppression at all is not a stop', () => {
    expect(decideFacilitatedStop([], []).stopped).toBe(false)
    expect(decideFacilitatedStop([], [grant()]).stopped).toBe(false)
  })

  test('THE DEFECT: an all_marketing withdrawal stops a facilitated message', () => {
    const verdict = decideFacilitatedStop([stop()], [])
    expect(verdict.stopped).toBe(true)
    // The scope is said in words a person reads, never as the column value:
    // this reason is shown on the member's own preferences page.
    expect(verdict.reason).toContain('an unsubscribe from all EventLinqs marketing')
    expect(verdict.reason).not.toContain('all_marketing')
  })

  test('facilitation_by_others stops it too, because the message promotes an organiser', () => {
    expect(decideFacilitatedStop([stop({ scope: 'facilitation_by_others' })], []).stopped).toBe(true)
  })

  test('tenant_own is neither, and does not stop it, which is what decideSend answers', () => {
    expect(decideFacilitatedStop([stop({ scope: 'tenant_own' })], []).stopped).toBe(false)
  })

  test('a suppression scoped to sms only does not stop an email', () => {
    expect(decideFacilitatedStop([stop({ channel: 'sms' })], []).stopped).toBe(false)
  })

  test('a suppression scoped to email, or to both, does stop an email', () => {
    expect(decideFacilitatedStop([stop({ channel: 'email' })], []).stopped).toBe(true)
    expect(decideFacilitatedStop([stop({ channel: 'both' })], []).stopped).toBe(true)
  })

  test('grant, withdraw leaves a withdrawal', () => {
    expect(decideFacilitatedStop([stop({ occurredAt: JUNE })], [grant({ occurredAt: MARCH })]).stopped).toBe(true)
  })

  test('grant, withdraw, grant leaves a grant: the stop is superseded and NOT permanent', () => {
    const verdict = decideFacilitatedStop(
      [stop({ occurredAt: JUNE })],
      [grant({ occurredAt: MARCH }), grant({ occurredAt: SEPTEMBER })],
    )
    expect(verdict.stopped).toBe(false)
    expect(verdict.reason).toContain('superseded')
  })

  test('a later DECLINE is not a grant and does not supersede a stop', () => {
    expect(
      decideFacilitatedStop(
        [stop({ occurredAt: JUNE })],
        [{ decision: 'declined', channelScope: 'both', occurredAt: SEPTEMBER }],
      ).stopped,
    ).toBe(true)
  })

  test('a later WITHDRAWAL is not a grant and does not supersede a stop', () => {
    expect(
      decideFacilitatedStop(
        [stop({ occurredAt: JUNE })],
        [{ decision: 'withdrawn', channelScope: 'both', occurredAt: SEPTEMBER }],
      ).stopped,
    ).toBe(true)
  })

  test('a later grant on a channel the stop does not cover cannot supersede it', () => {
    expect(
      decideFacilitatedStop([stop({ occurredAt: JUNE })], [grant({ channelScope: 'sms', occurredAt: SEPTEMBER })])
        .stopped,
    ).toBe(true)
  })

  test('the LATEST suppression decides, whatever order the rows arrive in', () => {
    const rows = [stop({ occurredAt: MARCH }), stop({ occurredAt: SEPTEMBER, scope: 'facilitation_by_others' })]
    expect(decideFacilitatedStop(rows, [grant({ occurredAt: JUNE })]).stopped).toBe(true)
    expect(decideFacilitatedStop([...rows].reverse(), [grant({ occurredAt: JUNE })]).stopped).toBe(true)
  })

  test('a grant at the SAME instant as the stop supersedes it, so a re-subscribe is never lost to a tie', () => {
    expect(decideFacilitatedStop([stop({ occurredAt: JUNE })], [grant({ occurredAt: JUNE })]).stopped).toBe(false)
  })

  /**
   * The first draft returned -Infinity for an unreadable date, which read as
   * "very old" and let ANY grant supersede it: a stop that failed open, inside
   * the function written to stop one.
   */
  test('an unreadable suppression date still stops, and no grant can supersede what cannot be compared', () => {
    expect(decideFacilitatedStop([stop({ occurredAt: 'not a date' })], []).stopped).toBe(true)
    expect(
      decideFacilitatedStop([stop({ occurredAt: 'not a date' })], [grant({ occurredAt: SEPTEMBER })]).stopped,
    ).toBe(true)
  })

  test('an unreadable GRANT date cannot supersede a readable stop', () => {
    expect(decideFacilitatedStop([stop({ occurredAt: JUNE })], [grant({ occurredAt: '' })]).stopped).toBe(true)
  })
})

/* ------------------------------------------------------------------------- */

type Row = Record<string, unknown>

/**
 * A database that pages like PostgREST does: it answers a window and never
 * volunteers that there is more. `pageCeiling` is the server's own cap, which
 * the caller cannot see and which is the whole reason the pager exists.
 */
function fakeLedger({
  tenant = { id: 'tenant-1' } as { id: string } | null,
  suppressions = [] as Row[],
  consents = [] as Row[],
  pageCeiling = 1000,
}: {
  tenant?: { id: string } | null
  suppressions?: Row[]
  consents?: Row[]
  pageCeiling?: number
} = {}) {
  const requests: string[] = []

  function window(rows: Row[], from: number, to: number) {
    return rows.slice(from, Math.min(to + 1, from + pageCeiling))
  }

  const db = {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          in: (_column: string, values: string[]) => {
            const filtered = {
              order: () => ({
                range: async (from: number, to: number) => {
                  requests.push(`${table}:in(${values.length}):${from}-${to}`)
                  const rows = consents.filter(row => values.includes(String(row.subject_email)))
                  return { data: window(rows, from, to), error: null }
                },
              }),
            }
            return filtered
          },
          order: () => ({
            range: async (from: number, to: number) => {
              requests.push(`${table}:${from}-${to}`)
              return { data: window(suppressions, from, to), error: null }
            },
          }),
          maybeSingle: async () => {
            requests.push(`${table}:tenant`)
            return { data: tenant, error: null }
          },
        }
        return chain
      },
    }),
  }
  return { db: db as never, requests }
}

describe('addressesStoppedForFacilitatedMail: the read that must not be half a read', () => {
  test('no tenant row means nobody has unsubscribed, not an error', async () => {
    const { db } = fakeLedger({ tenant: null })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toEqual(new Set())
  })

  test('an empty suppression table asks the consent ledger nothing at all', async () => {
    const { db, requests } = fakeLedger({ suppressions: [] })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toEqual(new Set())
    expect(requests.some(r => r.startsWith('consent_events'))).toBe(false)
  })

  test('addresses are normalised, so Case@X and case@x are one person', async () => {
    const { db } = fakeLedger({
      suppressions: [
        { subject_email: 'Case@X.test', channel: 'both', scope: 'all_marketing', occurred_at: JUNE },
      ],
    })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toEqual(new Set(['case@x.test']))
  })

  /**
   * THE SECOND DEFECT, pinned. An unbounded select stops at the server's ceiling
   * with HTTP 200 and no error. Measured against the live TEST project on
   * 20 September 2026: `Content-Range: 0-999/14364`. On a suppression list a
   * short read FAILS OPEN, so the 1,001st person who said stop gets written to.
   */
  test('THE DEFECT: more suppressions than one page still returns every one of them', async () => {
    const suppressions = Array.from({ length: 2_500 }, (_unused, index) => ({
      subject_email: `person-${index}@x.test`,
      channel: 'both',
      scope: 'all_marketing',
      occurred_at: JUNE,
    }))
    const { db } = fakeLedger({ suppressions, pageCeiling: 1000 })

    const stopped = await addressesStoppedForFacilitatedMail(db)

    expect(stopped.size).toBe(2_500)
    expect(stopped.has('person-0@x.test')).toBe(true)
    expect(stopped.has('person-1000@x.test')).toBe(true)
    expect(stopped.has('person-2499@x.test')).toBe(true)
  })

  test('a ceiling LOWER than the page size is not the end of the table either', async () => {
    const suppressions = Array.from({ length: 1_200 }, (_unused, index) => ({
      subject_email: `p${index}@x.test`,
      channel: 'both',
      scope: 'all_marketing',
      occurred_at: JUNE,
    }))
    const { db } = fakeLedger({ suppressions, pageCeiling: 250 })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toHaveProperty('size', 1_200)
  })

  test('the consent ledger is asked ONLY about addresses that already carry a stop', async () => {
    const { db, requests } = fakeLedger({
      suppressions: [{ subject_email: 'a@x.test', channel: 'both', scope: 'all_marketing', occurred_at: JUNE }],
      consents: [
        { subject_email: 'a@x.test', decision: 'granted', channel_scope: 'both', occurred_at: MARCH },
        { subject_email: 'somebody-else@x.test', decision: 'granted', channel_scope: 'both', occurred_at: MARCH },
      ],
    })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toEqual(new Set(['a@x.test']))
    expect(requests.filter(r => r.startsWith('consent_events:in(1)')).length).toBeGreaterThan(0)
  })

  test('a person who opted back in after the stop is not in the set', async () => {
    const { db } = fakeLedger({
      suppressions: [{ subject_email: 'back@x.test', channel: 'both', scope: 'all_marketing', occurred_at: JUNE }],
      consents: [
        { subject_email: 'back@x.test', decision: 'granted', channel_scope: 'both', occurred_at: SEPTEMBER },
      ],
    })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toEqual(new Set())
  })

  test('a row missing any of the four fields it needs is skipped rather than guessed at', async () => {
    const { db } = fakeLedger({
      suppressions: [
        { subject_email: null, channel: 'both', scope: 'all_marketing', occurred_at: JUNE },
        { subject_email: 'ok@x.test', channel: null, scope: 'all_marketing', occurred_at: JUNE },
        { subject_email: 'good@x.test', channel: 'both', scope: 'all_marketing', occurred_at: JUNE },
      ],
    })
    await expect(addressesStoppedForFacilitatedMail(db)).resolves.toEqual(new Set(['good@x.test']))
  })
})
