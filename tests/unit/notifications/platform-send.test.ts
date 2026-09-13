// DELIVERY FOR THE OWNER'S NOTIFICATIONS, driven rather than asserted.
//
// Close-out UX3.2 is one sentence with four obligations in it: recorded,
// retried, escalated to a second channel, and never silent. Each is a separate
// test here, and the failure paths are exercised as hard as the success path,
// because H2 already proved that an alert channel which drops itself looks
// exactly like a quiet day.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformNotificationRow } from '@/lib/notifications/platform-policy'
import { PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS, PLATFORM_ORDER_ALERTS_PER_DAY } from '@/lib/notifications/platform-policy'

const h = vi.hoisted(() => ({
  emailFails: null as string | null,
  sent: [] as Array<{ to: string; subject: string; html: string; text?: string }>,
  pushConfigured: true,
  pushOk: true,
  pushed: [] as Array<{ endpoint: string; title: string }>,
  captured: [] as string[],
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (input: { to: string; subject: string; html: string; text?: string }) => {
    if (h.emailFails) throw new Error(h.emailFails)
    h.sent.push(input)
  }),
}))

vi.mock('@/lib/env/destinations', () => ({
  alertDestination: () => 'owner@example.test',
  PLATFORM_INBOX: 'owner@example.test',
}))

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: () => 'https://example.test',
  getAppUrl: () => 'https://example.test',
}))

vi.mock('@/lib/observability/sentry', () => ({
  captureException: (err: unknown) => {
    h.captured.push(err instanceof Error ? err.message : String(err))
  },
}))

vi.mock('@/lib/notifications/web-push', () => ({
  isPushConfigured: () => h.pushConfigured,
  sendWebPush: async (sub: { endpoint: string }, payload: { title: string }) => {
    h.pushed.push({ endpoint: sub.endpoint, title: payload.title })
    return { ok: h.pushOk, statusCode: h.pushOk ? 201 : 410, gone: !h.pushOk }
  },
}))

const {
  dispatchPendingPlatformNotifications,
  sendHeldDigest,
  readPlatformNotificationFeed,
  countUndelivered,
} = await import('@/lib/notifications/platform-send')

/* ------------------------------------------------------------------ the fake */

type Filter = [string, string, unknown]

type Op = {
  table: string
  verb: 'select' | 'update' | 'delete'
  head: boolean
  filters: Filter[]
  payload?: Record<string, unknown>
}

/** Rows keyed by table, mutated in place so an update is visible to a later read. */
const db: Record<string, Record<string, unknown>[]> = {}

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every(([op, column, value]) => {
    const cell = row[column]
    switch (op) {
      case 'eq':
        return cell === value
      case 'neq':
        return cell !== value
      case 'in':
        return (value as unknown[]).includes(cell)
      case 'is':
        return cell === value
      case 'gte':
        return String(cell ?? '') >= String(value)
      default:
        throw new Error(`the fake does not implement ${op}`)
    }
  })
}

function builder(table: string, verb: Op['verb'], payload?: Record<string, unknown>) {
  const op: Op = { table, verb, head: false, filters: [], payload }
  const api = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) op.head = true
      return api
    },
    eq(column: string, value: unknown) {
      op.filters.push(['eq', column, value])
      return api
    },
    neq(column: string, value: unknown) {
      op.filters.push(['neq', column, value])
      return api
    },
    in(column: string, value: unknown[]) {
      op.filters.push(['in', column, value])
      return api
    },
    is(column: string, value: unknown) {
      op.filters.push(['is', column, value])
      return api
    },
    gte(column: string, value: unknown) {
      op.filters.push(['gte', column, value])
      return api
    },
    order() {
      return api
    },
    limit() {
      return api
    },
    then(resolve: (v: unknown) => void) {
      const rows = (db[table] ?? []).filter(r => matches(r, op.filters))
      if (op.verb === 'update') {
        for (const r of rows) Object.assign(r, op.payload)
        resolve({ data: null, error: null })
        return
      }
      if (op.verb === 'delete') {
        db[table] = (db[table] ?? []).filter(r => !matches(r, op.filters))
        resolve({ data: null, error: null })
        return
      }
      if (op.head) {
        resolve({ data: null, count: rows.length, error: null })
        return
      }
      resolve({ data: rows.map(r => ({ ...r })), count: rows.length, error: null })
    },
  }
  return api
}

const admin = {
  from(table: string) {
    return {
      select: (cols?: string, opts?: { count?: string; head?: boolean }) =>
        builder(table, 'select').select(cols, opts),
      update: (payload: Record<string, unknown>) => builder(table, 'update', payload),
      delete: () => builder(table, 'delete'),
    }
  },
} as never

/* --------------------------------------------------------------------- rows */

let seq = 0
function pending(over: Partial<PlatformNotificationRow> = {}): Record<string, unknown> {
  seq += 1
  return {
    id: `row-${seq}`,
    kind: 'order_paid',
    occurred_at: `2026-09-09T00:0${seq % 10}:00.000Z`,
    actor_user_id: null,
    organisation_id: 'org-1',
    event_id: 'event-1',
    order_id: `order-${seq}`,
    actor_label: 'buyer@example.test',
    organisation_name: 'MKL Studios',
    event_title: 'Afro Fusion Music Showcase',
    summary: `Paid order EL-${seq}`,
    detail: { order_number: `EL-${seq}`, total_cents: 4500, currency: 'AUD' },
    admin_path: `/admin/orders/order-${seq}`,
    delivery_state: 'pending',
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
    sent_at: null,
    channel: null,
    ...over,
  }
}

beforeEach(() => {
  seq = 0
  db.platform_notifications = []
  db.admin_users = [{ id: 'admin-1', disabled_at: null }]
  db.push_subscriptions = [{ user_id: 'admin-1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }]
  h.emailFails = null
  h.sent = []
  h.pushConfigured = true
  h.pushOk = true
  h.pushed = []
  h.captured = []
})

/* -------------------------------------------------------------------- tests */

describe('the happy path', () => {
  it('emails the owner and records the row as sent, with the channel', async () => {
    db.platform_notifications = [pending()]
    const summary = await dispatchPendingPlatformNotifications({ admin })

    expect(summary).toMatchObject({ considered: 1, sent: 1, held: 0, failed: 0 })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].to).toBe('owner@example.test')
    expect(h.sent[0].subject).toContain('Paid order EL-1')
    expect(h.sent[0].html).toContain('https://example.test/admin/orders/order-1')

    const row = db.platform_notifications[0]
    expect(row.delivery_state).toBe('sent')
    expect(row.channel).toBe('email')
    expect(row.sent_at).toBeTruthy()
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBeNull()
  })

  it('does nothing, loudly, when there is nothing to do', async () => {
    const summary = await dispatchPendingPlatformNotifications({ admin })
    expect(summary.considered).toBe(0)
    expect(h.sent).toHaveLength(0)
  })
})

describe('a failure is recorded and retried, never swallowed', () => {
  it('leaves the row pending with the reason written down', async () => {
    h.emailFails = 'Resend answered 429'
    db.platform_notifications = [pending()]

    const summary = await dispatchPendingPlatformNotifications({ admin })
    expect(summary.retried).toBe(1)

    const row = db.platform_notifications[0]
    expect(row.delivery_state).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('Resend answered 429')
    expect(row.last_attempt_at).toBeTruthy()
    expect(h.pushed).toHaveLength(0)
  })

  it('retries up to the bound and only then reaches for the second channel', async () => {
    h.emailFails = 'Resend answered 429'
    db.platform_notifications = [pending()]

    for (let i = 1; i < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; i++) {
      await dispatchPendingPlatformNotifications({ admin })
      expect(db.platform_notifications[0].delivery_state).toBe('pending')
      expect(h.pushed).toHaveLength(0)
    }

    await dispatchPendingPlatformNotifications({ admin })
    expect(db.platform_notifications[0].delivery_state).toBe('escalated')
    expect(db.platform_notifications[0].channel).toBe('push')
    expect(h.pushed).toHaveLength(1)
  })
})

describe('when every channel fails', () => {
  const exhaust = async () => {
    for (let i = 0; i < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; i++) {
      await dispatchPendingPlatformNotifications({ admin })
    }
  }

  it('is marked failed, names BOTH reasons, and raises', async () => {
    h.emailFails = 'Resend answered 500'
    h.pushOk = false
    db.platform_notifications = [pending()]

    await exhaust()

    const row = db.platform_notifications[0]
    expect(row.delivery_state).toBe('failed')
    expect(row.channel).toBeNull()
    expect(String(row.last_error)).toContain('Resend answered 500')
    expect(String(row.last_error)).toContain('refused')
    expect(h.captured).toHaveLength(1)
    expect(h.captured[0]).toContain('undeliverable on every channel')
  })

  it('says so plainly when push is not configured at all', async () => {
    h.emailFails = 'no key'
    h.pushConfigured = false
    db.platform_notifications = [pending()]

    await exhaust()
    expect(String(db.platform_notifications[0].last_error)).toContain('VAPID keys absent')
  })

  it('says so plainly when nobody has armed a device', async () => {
    h.emailFails = 'no key'
    db.push_subscriptions = []
    db.platform_notifications = [pending()]

    await exhaust()
    expect(String(db.platform_notifications[0].last_error)).toContain('no admin device')
  })

  it('prunes a push endpoint the vendor says is gone', async () => {
    h.emailFails = 'no key'
    h.pushOk = false
    db.platform_notifications = [pending()]
    await exhaust()
    expect(db.push_subscriptions).toHaveLength(0)
  })
})

describe('the daily ceiling, at its boundary', () => {
  it('holds everything past the ceiling inside a single run', async () => {
    const n = PLATFORM_ORDER_ALERTS_PER_DAY
    db.platform_notifications = Array.from({ length: n + 3 }, () => pending())

    const summary = await dispatchPendingPlatformNotifications({ admin, limit: n + 3 })

    expect(summary.sent).toBe(n)
    expect(summary.held).toBe(3)
    expect(h.sent).toHaveLength(n)
    const held = db.platform_notifications.filter(r => r.delivery_state === 'held_for_digest')
    expect(held).toHaveLength(3)
  })

  it('counts what was already sent today, so a second run does not restart the ceiling', async () => {
    const n = PLATFORM_ORDER_ALERTS_PER_DAY
    const sentToday = Array.from({ length: n }, () =>
      pending({
        delivery_state: 'sent',
        channel: 'email',
        sent_at: new Date().toISOString(),
      }),
    )
    db.platform_notifications = [...sentToday, pending()]

    const summary = await dispatchPendingPlatformNotifications({ admin })
    expect(summary.sent).toBe(0)
    expect(summary.held).toBe(1)
  })

  it('never holds a kind whose volume the public does not set', async () => {
    const n = PLATFORM_ORDER_ALERTS_PER_DAY
    db.platform_notifications = Array.from({ length: n + 2 }, () =>
      pending({ kind: 'event_published', detail: {} }),
    )
    const summary = await dispatchPendingPlatformNotifications({ admin, limit: n + 2 })
    expect(summary.held).toBe(0)
    expect(summary.sent).toBe(n + 2)
  })
})

describe('the digest', () => {
  it('sends one email for every held row and marks them all', async () => {
    db.platform_notifications = [
      pending({ delivery_state: 'held_for_digest' }),
      pending({ delivery_state: 'held_for_digest' }),
      pending({ delivery_state: 'held_for_digest' }),
    ]

    const summary = await sendHeldDigest({ admin })
    expect(summary).toMatchObject({ held: 3, sent: 3 })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].subject).toBe('EventLinqs: 3 more paid orders today')
    for (const row of db.platform_notifications) {
      expect(row.delivery_state).toBe('sent')
      expect(row.channel).toBe('digest')
    }
  })

  it('does not send an empty digest', async () => {
    const summary = await sendHeldDigest({ admin })
    expect(summary.held).toBe(0)
    expect(h.sent).toHaveLength(0)
  })

  /*
   * THE DIGEST RETRIES BEFORE IT ESCALATES, like every other path in this
   * module. Until 13 September 2026 it did not, and the two tests below used to
   * PIN that: they asserted a push and a `failed` row after ONE refusal. One
   * transient 429 from the mail vendor therefore threw away a digest carrying up
   * to two hundred orders, permanently, because a `failed` row is neither
   * `pending` nor `held_for_digest` and nothing reads it again.
   */
  it('holds a failed digest for the next tick instead of escalating on the first refusal', async () => {
    h.emailFails = 'Resend down'
    db.platform_notifications = Array.from({ length: 5 }, () =>
      pending({ delivery_state: 'held_for_digest' }),
    )

    const summary = await sendHeldDigest({ admin })
    expect(summary).toMatchObject({ held: 5, retried: 5, escalated: 0, failed: 0 })
    expect(h.pushed).toHaveLength(0)
    expect(db.platform_notifications.every(r => r.delivery_state === 'held_for_digest')).toBe(true)
    expect(db.platform_notifications.every(r => r.attempts === 1)).toBe(true)
  })

  it('recovers on a later tick, so a transient refusal costs a minute and not the digest', async () => {
    h.emailFails = 'Resend down'
    db.platform_notifications = Array.from({ length: 3 }, () =>
      pending({ delivery_state: 'held_for_digest' }),
    )

    await sendHeldDigest({ admin })
    h.emailFails = null
    const summary = await sendHeldDigest({ admin })

    expect(summary).toMatchObject({ held: 3, sent: 3 })
    expect(h.sent).toHaveLength(1)
    expect(db.platform_notifications.every(r => r.delivery_state === 'sent')).toBe(true)
    expect(db.platform_notifications.every(r => r.channel === 'digest')).toBe(true)
  })

  it('escalates as ONE push, not one per row, once the attempts are exhausted', async () => {
    h.emailFails = 'Resend down'
    db.platform_notifications = Array.from({ length: 5 }, () =>
      pending({ delivery_state: 'held_for_digest' }),
    )

    for (let i = 1; i < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; i += 1) {
      const held = await sendHeldDigest({ admin })
      expect(held.retried).toBe(5)
      expect(h.pushed).toHaveLength(0)
    }
    const summary = await sendHeldDigest({ admin })

    expect(summary.escalated).toBe(5)
    expect(h.pushed).toHaveLength(1)
    expect(db.platform_notifications.every(r => r.delivery_state === 'escalated')).toBe(true)
  })

  it('marks a digest failed on both channels and raises once, and only after the retries', async () => {
    h.emailFails = 'Resend down'
    h.pushConfigured = false
    db.platform_notifications = [pending({ delivery_state: 'held_for_digest' })]

    for (let i = 1; i < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; i += 1) {
      await sendHeldDigest({ admin })
      expect(db.platform_notifications[0].delivery_state).toBe('held_for_digest')
      expect(h.captured).toHaveLength(0)
    }
    const summary = await sendHeldDigest({ admin })

    expect(summary.failed).toBe(1)
    expect(h.captured).toHaveLength(1)
    expect(db.platform_notifications[0].delivery_state).toBe('failed')
    expect(db.platform_notifications[0].attempts).toBe(PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS)
  })

  it('counts the batch by its highest attempts, so a new order joining cannot reset the clock', async () => {
    h.emailFails = 'Resend down'
    h.pushConfigured = false
    db.platform_notifications = [
      pending({ delivery_state: 'held_for_digest', attempts: PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1 }),
      pending({ delivery_state: 'held_for_digest', attempts: 0 }),
    ]

    const summary = await sendHeldDigest({ admin })

    expect(summary.failed).toBe(2)
    expect(db.platform_notifications.every(r => r.delivery_state === 'failed')).toBe(true)
  })

  it('a digested row does not count against tomorrow ceiling, because its channel is digest', async () => {
    db.platform_notifications = [pending({ delivery_state: 'held_for_digest' })]
    await sendHeldDigest({ admin })
    db.platform_notifications.push(pending())
    const summary = await dispatchPendingPlatformNotifications({ admin })
    expect(summary.sent).toBe(1)
  })
})

/*
 * THE DIGEST'S ATTEMPTS ARE THE DIGEST'S OWN. Found on 13 September 2026.
 *
 * The rule above, "count the batch by its highest attempts", is right while
 * every attempt on a held row was spent ON THE DIGEST. It was not: a row that
 * failed as an INDIVIDUAL email stays `pending` with its counter incremented,
 * and if the ceiling is crossed before the next tick reaches it, the dispatcher
 * held it with that counter intact. The digest then inherited attempts it had
 * never made, and at two of three it gave up on its FIRST refusal - which is
 * exactly the defect fixed earlier the same day, reachable through another door
 * and carrying up to two hundred orders when it fires.
 */
describe('the digest does not inherit the individual path attempts', () => {
  /** 20 order alerts already delivered today, so the next one must be held. */
  function ceilingAlreadyReached(): Record<string, unknown>[] {
    return Array.from({ length: PLATFORM_ORDER_ALERTS_PER_DAY }, () =>
      pending({ delivery_state: 'sent', channel: 'email', sent_at: new Date().toISOString() }),
    )
  }

  it('hands the digest a fresh count, because a held row has never been tried AS a digest', async () => {
    const spent = pending({
      attempts: PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1,
      last_attempt_at: '2026-09-13T01:00:00.000Z',
      last_error: `email attempt ${PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1}: Resend down`,
    })
    db.platform_notifications = [...ceilingAlreadyReached(), spent]

    const summary = await dispatchPendingPlatformNotifications({ admin })

    expect(summary.held).toBe(1)
    const held = db.platform_notifications.find(r => r.id === spent.id) as Record<string, unknown>
    expect(held.delivery_state).toBe('held_for_digest')
    expect(held.attempts).toBe(0)
    // The history is kept rather than quietly dropped: the feed must not show
    // "attempt 2 failed" beside a counter that reads 0.
    expect(String(held.last_error)).toContain('held for the digest')
    expect(String(held.last_error)).toContain('Resend down')
  })

  it('still retries the digest three times when the row arrives with attempts spent', async () => {
    const spent = pending({ attempts: PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1 })
    db.platform_notifications = [...ceilingAlreadyReached(), spent]
    await dispatchPendingPlatformNotifications({ admin })

    h.emailFails = 'Resend down'
    h.pushConfigured = false

    for (let i = 1; i < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; i += 1) {
      const tick = await sendHeldDigest({ admin })
      expect(tick).toMatchObject({ held: 1, retried: 1, escalated: 0, failed: 0 })
      const row = db.platform_notifications.find(r => r.id === spent.id) as Record<string, unknown>
      expect(row.delivery_state).toBe('held_for_digest')
      expect(row.attempts).toBe(i)
    }

    const last = await sendHeldDigest({ admin })
    expect(last).toMatchObject({ held: 1, failed: 1 })
  })

  it('delivers the held order on a later tick, so one individual refusal costs nothing', async () => {
    const spent = pending({ attempts: PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1 })
    db.platform_notifications = [...ceilingAlreadyReached(), spent]
    await dispatchPendingPlatformNotifications({ admin })

    h.emailFails = 'Resend down'
    h.pushConfigured = false
    await sendHeldDigest({ admin })
    h.emailFails = null

    const recovered = await sendHeldDigest({ admin })
    expect(recovered).toMatchObject({ held: 1, sent: 1, failed: 0 })
    const row = db.platform_notifications.find(r => r.id === spent.id) as Record<string, unknown>
    expect(row.delivery_state).toBe('sent')
    expect(row.channel).toBe('digest')
  })
})

describe('the admin feed', () => {
  it('reads every row, whatever its state', async () => {
    db.platform_notifications = [
      pending(),
      pending({ delivery_state: 'sent', channel: 'email' }),
      pending({ delivery_state: 'failed' }),
    ]
    const feed = await readPlatformNotificationFeed(admin)
    expect(feed).toHaveLength(3)
  })

  it('counts only the undelivered, so the banner is never a false alarm', async () => {
    db.platform_notifications = [
      pending({ delivery_state: 'sent', channel: 'email' }),
      pending({ delivery_state: 'failed' }),
      pending({ delivery_state: 'failed' }),
    ]
    expect(await countUndelivered(admin)).toBe(2)
  })
})
