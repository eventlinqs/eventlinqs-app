// A READ THAT CANNOT BE READ DEFERS THE MESSAGE. IT NEVER DECIDES IT.
//
// Every read in `dispatchAlert` discarded its error until 21 September 2026, and
// each of the three decisions it takes was therefore available to a dropped
// socket. All three were driven on TEST against the real project before this
// file was written (scripts/verify/a-blink-is-not-a-preference-drive.mjs, red
// reading 10 of 16, green reading 16 of 16); these tests are the same three
// facts pinned without a database, plus the two that were cheaper to pin here
// than to drive.
//
//   THE CHANNELS. `loadPrefs` fell through to DEFAULT_PREFS, which is
//   `push_enabled: true, email_enabled: true`. A person who had switched every
//   channel off was indistinguishable from a person who had never opened the
//   page, and the drive watched the email being composed for them.
//
//   THE QUIET HOURS, the same read and a separate promise. DEFAULT_PREFS carries
//   `quiet_hours_start: null` and a null window is never quiet, so one blinked
//   read took the window away and sent inside it. /account/notifications makes
//   that promise to the reader in its own words.
//
//   THE DEDUPE. A blinked read of `notifications` answers "no row", which reads
//   as "not sent yet", so the alert goes out a SECOND time. The unique index on
//   (user_id, event_id, type) does not save it, because the row is written AFTER
//   the send: the constraint stops the second ROW, not the second MESSAGE.
//
// WHY A THROW IS THE RIGHT ANSWER AND NOT THE TIMID ONE. Throwing leaves the
// `notifications` row unwritten, and that row is the dedupe key, so the cron
// considers the recipient again within the quarter hour. A blink costs a delay.
// Deciding costs a message to somebody who switched it off, at an hour they
// asked to be left alone, or twice, and none of those can be taken back. The
// caller's half of that bargain is pinned in tests/unit/cron/notify-just-announced.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; subject: string }>,
  pushed: [] as Array<{ endpoint: string }>,
  /** Tables whose READS fail as a dropped keep-alive socket fails. */
  blinking: new Set<string>(),
  /** Every read attempt, so a retry can be told from a believed answer. */
  reads: [] as string[],
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (input: { to: string; subject: string }) => {
    h.sent.push(input)
  }),
}))
vi.mock('@/lib/site-url', () => ({
  getSiteUrl: () => 'https://example.test',
  getAppUrl: () => 'https://example.test',
}))
vi.mock('@/lib/email/sender', () => ({ contactAddress: (m: string) => `${m}@example.test` }))
vi.mock('@/lib/notifications/web-push', () => ({
  isPushConfigured: () => true,
  sendWebPush: async (sub: { endpoint: string }) => {
    h.pushed.push({ endpoint: sub.endpoint })
    return { ok: true, statusCode: 201, gone: false }
  },
}))

const { dispatchAlert } = await import('@/lib/notifications/dispatch')
const { ReadFailed } = await import('@/lib/supabase/read-or-throw')

/* ------------------------------------------------------------------ the fake */

type Filter = [string, string, unknown]
const db: Record<string, Record<string, unknown>[]> = {}

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every(([op, column, value]) => {
    const cell = row[column]
    if (op === 'eq') return cell === value
    if (op === 'in') return (value as unknown[]).includes(cell)
    throw new Error(`the fake does not implement ${op}`)
  })
}

/**
 * A PostgREST response, including the one shape this whole file is about: a
 * transient fault leaves `data` null and puts the reason in `error`, which is
 * indistinguishable from an empty table to anybody who does not look.
 *
 * The error carries no `code`, and that is deliberate: `readOrThrow` answers
 * null ONLY for PGRST116, the one error that genuinely means "no row". A blink
 * is not that, and a fake that stamped a code on it would have proved nothing.
 */
function blink(table: string) {
  return { data: null, error: { message: `fetch failed reading ${table}`, name: 'SocketError' } }
}

function builder(table: string, verb: 'select' | 'insert' | 'delete', payload?: Record<string, unknown>) {
  const filters: Filter[] = []
  let cap: number | null = null
  const rows = () => (db[table] ?? []).filter((r) => matches(r, filters))
  const api = {
    select: () => api,
    eq(column: string, value: unknown) {
      filters.push(['eq', column, value])
      return api
    },
    in(column: string, value: unknown[]) {
      filters.push(['in', column, value])
      return api
    },
    limit(n: number) {
      cap = n
      return api
    },
    async maybeSingle() {
      h.reads.push(table)
      if (h.blinking.has(table)) return blink(table)
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
      h.reads.push(table)
      if (h.blinking.has(table)) {
        resolve(blink(table))
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

function call(now = new Date('2026-09-21T02:00:00Z')) {
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
    },
  })
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]
  h.sent.length = 0
  h.pushed.length = 0
  h.reads.length = 0
  h.blinking.clear()
  db.profiles = [{ id: USER, email: 'someone@example.test' }]
})

describe('the preferences a person set', () => {
  it('sends nothing to somebody who switched every channel off when their preferences cannot be read', async () => {
    db.notification_prefs = [
      {
        user_id: USER,
        push_enabled: false,
        email_enabled: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
        timezone: 'Australia/Sydney',
      },
    ]

    // With every read working the router already refuses, so the blink below is
    // the only thing under test.
    await expect(call()).resolves.toEqual({ status: 'skipped', reason: 'opted_out' })

    h.blinking.add('notification_prefs')
    await expect(call()).rejects.toBeInstanceOf(ReadFailed)
    expect(h.sent).toHaveLength(0)
    expect(h.pushed).toHaveLength(0)
    expect(db.notifications ?? []).toHaveLength(0)
  })

  it('retries the preference read rather than believing the first failure', async () => {
    db.notification_prefs = [{ user_id: USER, push_enabled: false, email_enabled: false }]
    h.blinking.add('notification_prefs')

    await expect(call()).rejects.toBeInstanceOf(ReadFailed)

    // One call and three retries. The drive measures the same four against the
    // real project, where they are four separate HTTP requests.
    expect(h.reads.filter((t) => t === 'notification_prefs')).toHaveLength(4)
  })

  it('does not take away the quiet hours the account screen promised to keep', async () => {
    // 02:00 UTC is 12:00 in Sydney, inside a window of 11:00 to 13:00.
    const now = new Date('2026-09-21T02:00:00Z')
    db.notification_prefs = [
      {
        user_id: USER,
        push_enabled: true,
        email_enabled: true,
        quiet_hours_start: 11,
        quiet_hours_end: 13,
        timezone: 'Australia/Sydney',
      },
    ]

    await expect(call(now)).resolves.toEqual({ status: 'skipped', reason: 'quiet_hours' })

    h.blinking.add('notification_prefs')
    await expect(call(now)).rejects.toBeInstanceOf(ReadFailed)
    expect(h.sent).toHaveLength(0)
    // Nothing written, so the alert is delivered when the window ends rather
    // than lost. That is the difference between deferring and suppressing.
    expect(db.notifications ?? []).toHaveLength(0)
  })

  it('still uses the permissive defaults for somebody who has genuinely never set any', async () => {
    // The guard against over-correction: `readOrThrow` answers null for a real
    // absence, so a person with no row keeps the old behaviour and is reachable.
    db.notification_prefs = []
    await expect(call()).resolves.toEqual({ status: 'sent', channel: 'email' })
    expect(h.sent).toHaveLength(1)
  })
})

describe('an alert that has already been delivered', () => {
  beforeEach(() => {
    db.notification_prefs = [
      { user_id: USER, push_enabled: false, email_enabled: true, timezone: 'Australia/Sydney' },
    ]
  })

  it('is not sent a second time because the dedupe read blinked', async () => {
    await expect(call()).resolves.toEqual({ status: 'sent', channel: 'email' })
    expect(db.notifications).toHaveLength(1)
    await expect(call()).resolves.toEqual({ status: 'skipped', reason: 'duplicate' })
    expect(h.sent).toHaveLength(1)

    h.blinking.add('notifications')
    await expect(call()).rejects.toBeInstanceOf(ReadFailed)

    // The one delivery that happened, and no second message.
    expect(h.sent).toHaveLength(1)
  })
})

describe('the two reads that used to answer quietly', () => {
  it('does not silently move a push person onto email when their devices cannot be read', async () => {
    db.notification_prefs = [
      { user_id: USER, push_enabled: true, email_enabled: true, timezone: 'Australia/Sydney' },
    ]
    db.push_subscriptions = [{ user_id: USER, endpoint: 'https://push.test/a', p256dh: 'k', auth: 'a' }]

    await expect(call()).resolves.toEqual({ status: 'sent', channel: 'push' })
    expect(h.pushed).toHaveLength(1)

    db.notifications = []
    h.blinking.add('push_subscriptions')
    await expect(call()).rejects.toBeInstanceOf(ReadFailed)
    // The alert is deferred, not delivered down a channel they did not choose.
    expect(h.sent).toHaveLength(0)
  })

  it('does not report `no_email` about somebody who has one', async () => {
    db.notification_prefs = [
      { user_id: USER, push_enabled: false, email_enabled: true, timezone: 'Australia/Sydney' },
    ]
    h.blinking.add('profiles')

    // `no_email` is a fact about a person and it goes into the figures an
    // operator reads. A read that could not be made is not that fact.
    await expect(call()).rejects.toBeInstanceOf(ReadFailed)
    expect(h.sent).toHaveLength(0)
  })
})
