/**
 * WI1, REMIND ME: every branch of a request, with the database, the limiter and
 * the switch replaced by recorders, so "stores nothing" is proved by counting.
 *
 * Lawal's change 4 of 21 October 2026: "Add a hidden honeypot field to the
 * Remind me form. A submission that fills it gets the normal success message
 * and stores nothing. Test it." The first describe block is that test.
 */
import { describe, expect, it } from 'vitest'
import { handleReminderRequest, type ReminderDeps, type ReminderEvent } from '@/lib/walk-in/remind-me-request'
import { REMIND_ME_CONSENT_VERSION, REMIND_ME_DONE, remindMePurpose } from '@/lib/walk-in/remind-me'

const EVENT_ID = '7f3a2c1e-0b4d-4e5f-9a6b-1c2d3e4f5a6b'
const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString()

function recorder(overrides: Partial<ReminderDeps> = {}, event: Partial<ReminderEvent> | null = {}) {
  const calls = { limiter: 0, switch: 0, reads: 0, inserts: [] as unknown[], restarts: [] as unknown[] }
  const deps: ReminderDeps = {
    remindMeOn: async () => {
      calls.switch++
      return true
    },
    rateLimitOk: async () => {
      calls.limiter++
      return true
    },
    readEvent: async () => {
      calls.reads++
      return event === null
        ? null
        : {
            id: EVENT_ID,
            status: 'published',
            visibility: 'public',
            entry_mode: 'walk_in',
            end_date: FUTURE,
            organiser_name: 'AMCF',
            program_published: false,
            ...event,
          }
    },
    readReminder: async () => null,
    insertReminder: async (row) => {
      calls.inserts.push(row)
      return true
    },
    restartReminder: async (id, consent) => {
      calls.restarts.push({ id, consent })
      return true
    },
    now: () => new Date(),
    ...overrides,
  }
  return { deps, calls }
}

describe('the bot trap: a filled trap gets the normal answer and stores nothing', () => {
  it('returns exactly what a person gets', async () => {
    const { deps } = recorder()
    const human = await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'a@example.com', trap: '' })
    const bot = await handleReminderRequest(recorder().deps, { eventId: EVENT_ID, email: 'a@example.com', trap: 'http://spam.example' })
    expect(bot).toEqual(human)
    expect(bot).toEqual({ ok: true, message: REMIND_ME_DONE })
  })

  it('writes nothing, reads nothing, and does not even touch the limiter', async () => {
    const { deps, calls } = recorder()
    await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'a@example.com', trap: 'x' })
    expect(calls.inserts).toEqual([])
    expect(calls.restarts).toEqual([])
    expect(calls.reads).toBe(0)
    expect(calls.limiter).toBe(0)
    expect(calls.switch).toBe(0)
  })

  it('a trap of only spaces is not a trap (a person cannot see it to type spaces either way)', async () => {
    const { deps, calls } = recorder()
    await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'a@example.com', trap: '   ' })
    expect(calls.inserts).toHaveLength(1)
  })
})

describe('a person asking to be reminded', () => {
  it('stores one row, lower-cased, with the wording they read and its version', async () => {
    const { deps, calls } = recorder()
    const r = await handleReminderRequest(deps, { eventId: EVENT_ID, email: '  Ama@Example.COM ', trap: '' })
    expect(r.ok).toBe(true)
    expect(calls.inserts).toEqual([
      {
        event_id: EVENT_ID,
        email: 'ama@example.com',
        consent_version: REMIND_ME_CONSENT_VERSION,
        consent_text: remindMePurpose('AMCF', false),
      },
    ])
  })

  it('asking twice stores nothing new', async () => {
    const { deps, calls } = recorder({ readReminder: async () => ({ id: 'r1', unsubscribed_at: null }) })
    const r = await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'a@example.com', trap: '' })
    expect(r).toEqual({ ok: true, message: REMIND_ME_DONE })
    expect(calls.inserts).toEqual([])
    expect(calls.restarts).toEqual([])
  })

  it('asking again after stopping starts again, with the wording read now', async () => {
    const { deps, calls } = recorder(
      { readReminder: async () => ({ id: 'r1', unsubscribed_at: '2026-10-01T00:00:00Z' }) },
      { program_published: true },
    )
    await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'a@example.com', trap: '' })
    expect(calls.restarts).toEqual([
      { id: 'r1', consent: { consent_version: REMIND_ME_CONSENT_VERSION, consent_text: remindMePurpose('AMCF', true) } },
    ])
  })
})

describe('what is refused, in words, and never stored', () => {
  it.each([
    ['the switch is off (production until the privacy version is approved)', { remindMeOn: async () => false }, {}, /not open for this event yet/],
    ['the limit is reached', { rateLimitOk: async () => false }, {}, /Too many requests/],
    ['a draft event', {}, { status: 'draft' }, /could not be found/],
    ['an unlisted event', {}, { visibility: 'unlisted' }, /could not be found/],
    ['a ticketed event', {}, { entry_mode: 'tickets' }, /could not be found/],
    ['a finished event', {}, { end_date: new Date(Date.now() - 864e5).toISOString() }, /has finished/],
  ])('%s', async (_label, overrides, event, message) => {
    const { deps, calls } = recorder(overrides as Partial<ReminderDeps>, event as Partial<ReminderEvent>)
    const r = await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'a@example.com', trap: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(message)
    expect(calls.inserts).toEqual([])
  })

  it('an address that is not one', async () => {
    const { deps, calls } = recorder()
    const r = await handleReminderRequest(deps, { eventId: EVENT_ID, email: 'not an email', trap: '' })
    expect(r).toEqual({ ok: false, error: 'Enter a valid email address.' })
    expect(calls.reads).toBe(0)
  })

  it('an event id that is not a uuid', async () => {
    const { deps, calls } = recorder()
    const r = await handleReminderRequest(deps, { eventId: 'nope', email: 'a@example.com', trap: '' })
    expect(r.ok).toBe(false)
    expect(calls.reads).toBe(0)
  })
})

describe('the purpose beside the button promises only what is still true', () => {
  it('before the program: the timetable once, and a reminder', () => {
    expect(remindMePurpose('AMCF', false)).toBe(
      'We send the full timetable when AMCF releases it, and one reminder the day before. Nothing else.',
    )
  })
  it('after the program: a reminder only', () => {
    expect(remindMePurpose('AMCF', true)).toBe('We send one reminder the day before. Nothing else.')
  })
})
