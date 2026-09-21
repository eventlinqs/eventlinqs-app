// WHO CANNOT BE REACHED, AND WHY ASKING IS CHEAPER THAN IT LOOKS.
//
// The just-announced cron caps the work one run will do. Until 21 September 2026
// it spent that cap on every recipient it LOOKED at, so a population it could
// never deliver to sat at the front of the list and consumed the whole budget on
// every run, for ever. Two such populations existed: people already alerted, and
// people with every channel switched off.
//
// Neither may be written down as a suppression. Opting out must not destroy a
// future alert, so `findUnreachableUsers` is recomputed every run and stored
// nowhere: switch a channel back on and the next run reaches you.
//
// THE READ IS SMALL BECAUSE OF WHAT DEFAULT_PREFS SAYS. A user with no
// preferences row has BOTH channels on, so only an explicit row carrying
// `email_enabled = false` can possibly leave somebody with no channel. That is
// why this asks about email first and push second, and it is the difference
// between a filtered read and a scan of every follower's preferences.

import { beforeEach, describe, expect, it } from 'vitest'
import { findUnreachableUsers } from '@/lib/notifications/audience'

type Row = Record<string, unknown>

const db: Record<string, Row[]> = {}
/** Every filter the code applied, so the test can prove the read was narrow. */
let applied: { table: string; filters: [string, string, unknown][] }[] = []

function builder(table: string) {
  const filters: [string, string, unknown][] = []
  let window: { from: number; to: number } | null = null
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
    order: () => api,
    range(from: number, to: number) {
      window = { from, to }
      return api
    },
    then(resolve: (v: unknown) => void) {
      applied.push({ table, filters: [...filters] })
      let rows = (db[table] ?? []).filter((r) =>
        filters.every(([op, column, value]) =>
          op === 'in' ? (value as unknown[]).includes(r[column]) : r[column] === value,
        ),
      )
      if (window) rows = rows.slice(window.from, window.to + 1)
      resolve({ data: rows.map((r) => ({ ...r })), error: null })
    },
  }
  return api
}

const admin = { from: (table: string) => builder(table) } as never

function prefs(user_id: string, email_enabled: boolean, push_enabled: boolean) {
  ;(db.notification_prefs ||= []).push({ user_id, email_enabled, push_enabled })
}

function subscribed(user_id: string) {
  ;(db.push_subscriptions ||= []).push({ user_id, endpoint: `https://push.test/${user_id}` })
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]
  applied = []
})

describe('findUnreachableUsers', () => {
  it('reads nothing at all when there is nobody to ask about', async () => {
    expect(await findUnreachableUsers(admin, [])).toEqual(new Set())
    expect(applied).toHaveLength(0)
  })

  it('treats a user with no preferences row as reachable, because the defaults say so', async () => {
    expect(await findUnreachableUsers(admin, ['u-1', 'u-2'])).toEqual(new Set())
  })

  it('names the user who has switched both channels off', async () => {
    prefs('u-1', false, false)
    expect(await findUnreachableUsers(admin, ['u-1'])).toEqual(new Set(['u-1']))
  })

  it('keeps a user who allows push and actually has a device', async () => {
    prefs('u-1', false, true)
    subscribed('u-1')
    expect(await findUnreachableUsers(admin, ['u-1'])).toEqual(new Set())
  })

  it('names a user who allows push but has never armed a device, because that is no channel at all', async () => {
    // The case a preferences row alone cannot answer, and the reason this asks
    // about subscriptions rather than trusting push_enabled.
    prefs('u-1', false, true)
    expect(await findUnreachableUsers(admin, ['u-1'])).toEqual(new Set(['u-1']))
  })

  it('keeps everyone whose email is still on, whatever their push setting says', async () => {
    prefs('u-1', true, false)
    prefs('u-2', true, true)
    expect(await findUnreachableUsers(admin, ['u-1', 'u-2'])).toEqual(new Set())
  })

  it('never asks about subscriptions for somebody whose email is still on', async () => {
    // The whole reason this is a filtered read rather than a scan: the
    // preferences read is narrowed to email-off, and the subscription read is
    // narrowed again to the ones among those who allow push.
    prefs('u-1', true, true)
    prefs('u-2', false, false)
    await findUnreachableUsers(admin, ['u-1', 'u-2'])

    const prefReads = applied.filter((a) => a.table === 'notification_prefs')
    expect(prefReads.length).toBeGreaterThan(0)
    for (const read of prefReads) {
      expect(read.filters).toContainEqual(['eq', 'email_enabled', false])
    }
    // u-2 has push off, so there is nothing left to ask the subscription table.
    expect(applied.filter((a) => a.table === 'push_subscriptions')).toHaveLength(0)
  })

  it('answers for a population larger than one request may carry', async () => {
    // 300 users is past the 100-value `.in()` count bound, so this only works if
    // the read is chunked. Every one of them has both channels off.
    const users = Array.from({ length: 300 }, (_, i) => `u-${String(i).padStart(4, '0')}`)
    for (const u of users) prefs(u, false, false)

    expect(await findUnreachableUsers(admin, users)).toEqual(new Set(users))
  })
})
