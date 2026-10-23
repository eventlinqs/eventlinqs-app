/**
 * WI1, REMIND ME SENT: at most the program once and one reminder the day
 * before, each claimed before it goes, each with a working stop.
 *
 * WI1-ITEM.md point 3: "It sends at most: one update, when the organiser
 * publishes the program; one reminder, the day before. Each message carries a
 * working unsubscribe." The database answers who is due
 * (walk_in_reminders_due) and refuses a second claim (event_reminder_sends
 * unique); this file proves the run around them keeps those promises.
 */
import { describe, expect, it } from 'vitest'
import {
  runReminderPasses,
  DAY_BEFORE_LOCAL_HOUR,
  REMINDER_BATCH,
  REMIND_ME_RETENTION_DAYS_AFTER_EVENT,
  type DueRow,
  type ReminderKind,
  type ReminderSendDeps,
} from '@/lib/walk-in/reminder-sends'
import { buildReminderEmail, REMIND_STOP_PAGE, REMIND_STOP_ROUTE } from '@/lib/walk-in/reminder-messages'

const row = (n: number): DueRow => ({
  reminderId: `r${n}`,
  email: `p${n}@example.com`,
  token: '7f3a2c1e-0b4d-4e5f-9a6b-1c2d3e4f5a6b',
  eventId: 'e1',
  firstDay: '2026-11-20',
  timezone: 'Australia/Melbourne',
})

/** A fake database: due rows per kind, a claims table, a mailbox. */
function fakeWorld(due: Partial<Record<ReminderKind, DueRow[]>>, opts: { failSend?: string; purged?: number } = {}) {
  const claims = new Set<string>()
  const sent: Array<{ to: string; kind: ReminderKind }> = []
  const records: Array<{ id: string; kind: ReminderKind; result: unknown }> = []
  const dueCalls: Array<{ kind: ReminderKind; eventId: string | null; limit: number; localHour: number }> = []
  const purgeCalls: number[] = []
  const deps: ReminderSendDeps = {
    async due(kind, eventId, limit, _now, localHour) {
      dueCalls.push({ kind, eventId, limit, localHour })
      // Like the SQL: unclaimed rows only, at most `limit`.
      return (due[kind] ?? []).filter((r) => !claims.has(`${r.reminderId}:${kind}`)).slice(0, limit)
    },
    async claim(id, kind) {
      const key = `${id}:${kind}`
      if (claims.has(key)) return false
      claims.add(key)
      return true
    },
    async send(r, kind) {
      if (opts.failSend === r.reminderId) throw new Error('provider refused')
      sent.push({ to: r.email, kind })
      return { id: `msg-${r.reminderId}-${kind}` }
    },
    async record(id, kind, result) {
      records.push({ id, kind, result })
    },
    async purge(days) {
      purgeCalls.push(days)
      return opts.purged ?? 0
    },
  }
  return { deps, claims, sent, records, dueCalls, purgeCalls }
}

describe('each message goes once', () => {
  it('sends the program and the day-before reminder to each person due', async () => {
    const w = fakeWorld({ program: [row(1), row(2)], day_before: [row(1)] })
    const r = await runReminderPasses(w.deps, new Date())
    expect(r.program.sent).toBe(2)
    expect(r.dayBefore.sent).toBe(1)
    expect(w.sent).toEqual([
      { to: 'p1@example.com', kind: 'program' },
      { to: 'p2@example.com', kind: 'program' },
      { to: 'p1@example.com', kind: 'day_before' },
    ])
  })

  it('a second run sends nothing, because every message is already claimed', async () => {
    const w = fakeWorld({ program: [row(1)], day_before: [row(1)] })
    await runReminderPasses(w.deps, new Date())
    const again = await runReminderPasses(w.deps, new Date())
    expect(again.program.sent + again.dayBefore.sent).toBe(0)
    expect(w.sent).toHaveLength(2)
  })

  it('a claim already taken by an overlapping run is skipped, not sent', async () => {
    const w = fakeWorld({ program: [row(1)] })
    // Another run claimed it between the read and this claim.
    const original = w.deps.due
    w.deps.due = async (...a) => {
      const rows = await original(...a)
      w.claims.add('r1:program')
      return rows
    }
    const r = await runReminderPasses(w.deps, new Date())
    expect(r.program.alreadyClaimed).toBe(1)
    expect(w.sent).toEqual([])
  })

  it('a send that fails stays claimed and is recorded, never retried into a second copy', async () => {
    const w = fakeWorld({ program: [row(1)] }, { failSend: 'r1' })
    const r = await runReminderPasses(w.deps, new Date())
    expect(r.program.failed).toBe(1)
    expect(w.records).toEqual([{ id: 'r1', kind: 'program', result: { error: 'provider refused' } }])
    const again = await runReminderPasses(w.deps, new Date())
    expect(again.program.due).toBe(0)
  })

  it('works through more people than one batch, and stops', async () => {
    const many = Array.from({ length: REMINDER_BATCH + 7 }, (_, i) => row(i))
    const w = fakeWorld({ day_before: many })
    const r = await runReminderPasses(w.deps, new Date())
    expect(r.dayBefore.sent).toBe(REMINDER_BATCH + 7)
    expect(r.dayBefore.batches).toBe(2)
  })
})

describe('the day-before hour and retention are passed to the database, written once', () => {
  it('asks for the day-before rows at the platform morning hour', async () => {
    const w = fakeWorld({})
    await runReminderPasses(w.deps, new Date())
    expect(DAY_BEFORE_LOCAL_HOUR).toBe(9)
    expect(w.dueCalls.every((c) => c.localHour === DAY_BEFORE_LOCAL_HOUR)).toBe(true)
  })

  it('purges on the full sweep, never on one organiser pressing Send', async () => {
    const full = fakeWorld({}, { purged: 3 })
    expect((await runReminderPasses(full.deps, new Date())).purged).toBe(3)
    expect(full.purgeCalls).toEqual([REMIND_ME_RETENTION_DAYS_AFTER_EVENT])
    const one = fakeWorld({})
    await runReminderPasses(one.deps, new Date(), 'e1')
    expect(one.purgeCalls).toEqual([])
  })
})

describe('the emails say why they came and how to stop them', () => {
  const facts = {
    origin: 'https://www.eventlinqs.com.au',
    token: '7f3a2c1e-0b4d-4e5f-9a6b-1c2d3e4f5a6b',
    event: { title: 'Trivia at The Wool Exchange', slug: 'trivia-wool-exchange', venueName: 'The Wool Exchange', venueCity: 'Geelong', directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-38.14,144.36' },
    organiserName: 'The Wool Exchange',
    days: [{ date: '2026-11-20', opens: '19:00', closes: '22:00', hours_label: null, items: [{ when: '7pm', what: 'Round one' }], closer: null }],
  }

  it('the day-before reminder: tomorrow, free entry, the stop link and one-click headers', () => {
    const m = buildReminderEmail({ ...facts, kind: 'day_before' })
    expect(m.subject).toBe('Tomorrow: Trivia at The Wool Exchange')
    expect(m.text).toContain('Free entry, no ticket needed.')
    expect(m.text).toContain(`Stop these reminders: https://www.eventlinqs.com.au${REMIND_STOP_PAGE}/${facts.token}`)
    expect(m.text).toContain('nothing else will follow')
    expect(m.headers['List-Unsubscribe']).toBe(`<https://www.eventlinqs.com.au${REMIND_STOP_ROUTE}/${facts.token}>`)
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('the program update carries the program and promises only the reminder after it', () => {
    const m = buildReminderEmail({ ...facts, kind: 'program' })
    expect(m.subject).toBe('The full program for Trivia at The Wool Exchange is out')
    expect(m.text).toContain('7pm: Round one')
    expect(m.text).toContain('the only other will be a reminder the day before')
  })

  it('escapes what the organiser wrote', () => {
    const m = buildReminderEmail({ ...facts, kind: 'program', event: { ...facts.event, title: '<b>Night</b> & day' } })
    expect(m.html).not.toContain('<b>Night</b>')
    expect(m.html).toContain('&lt;b&gt;Night&lt;/b&gt; &amp; day')
  })
})
