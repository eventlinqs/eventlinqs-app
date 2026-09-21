// THE LIFECYCLE ALERT DISPATCHER, and the promise the account screen makes.
//
// /account/notifications says, in words, "nothing is sent inside your quiet
// hours". The window is collected by the screen, validated by the API, stored on
// notification_prefs and read by this dispatcher on every send - and until
// 13 September 2026 nothing ever consulted it. isWithinQuietHours existed in
// policy.ts, was exhaustively unit tested, and was called by no code at all, so
// a user who asked for silence between 10pm and 7am was pushed at 3am anyway.
//
// The behaviour these tests pin is DEFERRAL rather than suppression: the alert
// is skipped WITHOUT writing its notifications row, so the same cron that runs
// every fifteen minutes delivers it the moment the window ends. Nothing is lost
// and nothing arrives at 3am.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  emailFails: false,
  sent: [] as Array<{ to: string; subject: string }>,
  pushConfigured: true,
  pushed: [] as Array<{ endpoint: string; title: string }>,
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (input: { to: string; subject: string }) => {
    if (h.emailFails) throw new Error('mail refused')
    h.sent.push(input)
  }),
}))

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: () => 'https://example.test',
  getAppUrl: () => 'https://example.test',
}))

vi.mock('@/lib/email/sender', () => ({
  contactAddress: (mailbox: string) => `${mailbox}@example.test`,
}))

vi.mock('@/lib/notifications/web-push', () => ({
  isPushConfigured: () => h.pushConfigured,
  sendWebPush: async (sub: { endpoint: string }, payload: { title: string }) => {
    h.pushed.push({ endpoint: sub.endpoint, title: payload.title })
    return { ok: true, statusCode: 201, gone: false }
  },
}))

const { dispatchAlert } = await import('@/lib/notifications/dispatch')

/* ------------------------------------------------------------------ the fake */

type Filter = [string, string, unknown]

/** Rows keyed by table, mutated in place so an insert is visible to a later read. */
const db: Record<string, Record<string, unknown>[]> = {}

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every(([op, column, value]) => {
    const cell = row[column]
    if (op === 'eq') return cell === value
    if (op === 'in') return (value as unknown[]).includes(cell)
    throw new Error(`the fake does not implement ${op}`)
  })
}

function builder(table: string, verb: 'select' | 'insert' | 'delete', payload?: Record<string, unknown>) {
  const filters: Filter[] = []
  let cap: number | null = null
  const rows = () => (db[table] ?? []).filter((r) => matches(r, filters))
  const api = {
    select() {
      return api
    },
    eq(column: string, value: unknown) {
      filters.push(['eq', column, value])
      return api
    },
    in(column: string, value: unknown[]) {
      filters.push(['in', column, value])
      return api
    },
    /*
     * The device read states its own bound (MAX_PUSH_ENDPOINTS_PER_USER) rather
     * than paging, because it runs once per recipient on the alert cron's
     * hottest path. The fake honours it so the cap is exercised rather than
     * merely accepted.
     */
    limit(n: number) {
      cap = n
      return api
    },
    async maybeSingle() {
      const found = rows()
      return { data: found[0] ? { ...found[0] } : null, error: null }
    },
    then(resolve: (v: unknown) => void) {
      if (verb === 'insert') {
        db[table] = [...(db[table] ?? []), { ...(payload ?? {}) }]
        resolve({ data: null, error: null })
        return
      }
      if (verb === 'delete') {
        db[table] = (db[table] ?? []).filter((r) => !matches(r, filters))
        resolve({ data: null, error: null })
        return
      }
      const found = rows().map((r) => ({ ...r }))
      resolve({ data: cap === null ? found : found.slice(0, cap), error: null })
    },
  }
  return api
}

const admin = {
  from(table: string) {
    return {
      select: () => builder(table, 'select').select(),
      insert: (payload: Record<string, unknown>) => builder(table, 'insert', payload),
      delete: () => builder(table, 'delete'),
    }
  },
} as never

const USER = 'user-1'
const EVENT = 'event-1'

function prefs(over: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    push_enabled: true,
    email_enabled: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    timezone: 'Australia/Sydney',
    ...over,
  }
}

function call(now: Date) {
  return dispatchAlert({
    admin,
    userId: USER,
    eventId: EVENT,
    type: 'just_announced',
    now,
    ctx: {
      eventTitle: 'Afro Fusion Music Showcase',
      eventCity: 'Melbourne',
      organiserName: 'MKL Studios',
      url: 'https://example.test/events/afro-fusion',
      recipientEmail: 'follower@example.test',
    },
  })
}

/** 3:30 am in Sydney, the hour the shipped code was happy to push at. */
const THREE_THIRTY_AM_SYDNEY = new Date('2026-09-13T17:30:00.000Z')
/** 2:30 pm in Sydney the same day, plainly outside anybody's quiet hours. */
const HALF_TWO_PM_SYDNEY = new Date('2026-09-13T04:30:00.000Z')

beforeEach(() => {
  db.notifications = []
  db.notification_prefs = [prefs()]
  db.push_subscriptions = [{ user_id: USER, endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }]
  h.emailFails = false
  h.sent = []
  h.pushConfigured = true
  h.pushed = []
})

describe('the promise the account screen makes', () => {
  it('sends nothing at 3am when the user asked for quiet from 10pm to 7am', async () => {
    db.notification_prefs = [prefs({ quiet_hours_start: 22, quiet_hours_end: 7 })]

    const result = await call(THREE_THIRTY_AM_SYDNEY)

    expect(result).toEqual({ status: 'skipped', reason: 'quiet_hours' })
    expect(h.pushed).toHaveLength(0)
    expect(h.sent).toHaveLength(0)
  })

  it('holds it rather than losing it, so no record says it was dealt with', async () => {
    db.notification_prefs = [prefs({ quiet_hours_start: 22, quiet_hours_end: 7 })]

    await call(THREE_THIRTY_AM_SYDNEY)

    // The dedupe row is the only thing that stops a later run sending it. An
    // alert skipped for quiet hours must NOT write one, or the deferral becomes
    // a silent deletion.
    expect(db.notifications).toHaveLength(0)
  })

  it('delivers on the next run once the window has passed', async () => {
    db.notification_prefs = [prefs({ quiet_hours_start: 22, quiet_hours_end: 7 })]

    await call(THREE_THIRTY_AM_SYDNEY)
    const later = await call(HALF_TWO_PM_SYDNEY)

    expect(later).toEqual({ status: 'sent', channel: 'push' })
    expect(h.pushed).toHaveLength(1)
    expect(db.notifications).toHaveLength(1)
  })

  it('is quiet by the user own clock, not the platform one', async () => {
    // 3:30 am in Sydney is 5:30 pm the previous day in London. A Londoner with
    // the same window is wide awake and must get the alert.
    db.notification_prefs = [
      prefs({ quiet_hours_start: 22, quiet_hours_end: 7, timezone: 'Europe/London' }),
    ]

    const result = await call(THREE_THIRTY_AM_SYDNEY)

    expect(result).toEqual({ status: 'sent', channel: 'push' })
  })

  it('sends as usual when no quiet hours are set', async () => {
    const result = await call(THREE_THIRTY_AM_SYDNEY)
    expect(result).toEqual({ status: 'sent', channel: 'push' })
    expect(db.notifications).toHaveLength(1)
  })

  it('silences email too, because the promise does not name a channel', async () => {
    db.notification_prefs = [
      prefs({ quiet_hours_start: 22, quiet_hours_end: 7, push_enabled: false }),
    ]

    const result = await call(THREE_THIRTY_AM_SYDNEY)

    expect(result).toEqual({ status: 'skipped', reason: 'quiet_hours' })
    expect(h.sent).toHaveLength(0)
  })

  it('still refuses to send twice, quiet hours or not', async () => {
    await call(HALF_TWO_PM_SYDNEY)
    const again = await call(HALF_TWO_PM_SYDNEY)
    expect(again).toEqual({ status: 'skipped', reason: 'duplicate' })
    expect(db.notifications).toHaveLength(1)
  })

  it('does not fall over on a timezone the runtime cannot resolve', async () => {
    // The preferences API accepts any string up to 64 characters, so a value
    // Intl cannot parse can reach this code. One such row must not throw and
    // take the whole cron batch down with it.
    db.notification_prefs = [
      prefs({ quiet_hours_start: 22, quiet_hours_end: 7, timezone: 'Somewhere/Nowhere' }),
    ]

    const result = await call(THREE_THIRTY_AM_SYDNEY)

    // Falls back to the platform zone, where 3:30 am is inside the window.
    expect(result).toEqual({ status: 'skipped', reason: 'quiet_hours' })
  })
})
