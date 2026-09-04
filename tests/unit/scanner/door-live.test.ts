import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, test, vi } from 'vitest'
import {
  doorChannelName,
  mapStatus,
  describeLiveStatus,
  liveEntryFrom,
  subscribeToDoor,
  applyLiveEntry,
  describeLiveEntry,
  checkedInLine,
  feedFor,
  NO_SESSION_REASON,
  type DoorLiveClient,
} from '@/lib/scanner/door-live'
import { DoorStore } from '@/lib/scanner/door-store'
import type { LiveEntry } from '@/lib/scanner/door-types'

const EVENT = '22222222-2222-4222-8222-222222222222'
const SCAN = '33333333-3333-4333-8333-333333333333'
const TICKET = '44444444-4444-4444-8444-444444444444'
const ME = 'aaaaaaaa-0000-4000-8000-000000000000'
const OTHER = '3f2abbbb-0000-4000-8000-000000000000'
const NOW = Date.parse('2026-09-05T09:00:00.000Z')

function row(over: Record<string, unknown> = {}) {
  return {
    id: SCAN,
    ticket_id: TICKET,
    event_id: EVENT,
    result: 'admitted',
    scanned_at: '2026-09-05T08:59:30.000Z',
    device_id: OTHER,
    device_scanned_at: null,
    scanned_offline: false,
    review_status: 'none',
    ...over,
  }
}

describe('the channel and its words', () => {
  test('one channel per event, named so the drive can find it', () => {
    expect(doorChannelName(EVENT)).toBe(`door:${EVENT}`)
  })
  test("Supabase's statuses in the door's words", () => {
    expect(mapStatus('SUBSCRIBED')).toBe('live')
    expect(mapStatus('CLOSED')).toBe('off')
    expect(mapStatus('CHANNEL_ERROR')).toBe('reconnecting')
    expect(mapStatus('TIMED_OUT')).toBe('reconnecting')
    expect(mapStatus('anything else')).toBe('connecting')
    expect(describeLiveStatus('live')).toBe('Live with the other doors')
    expect(describeLiveStatus('reconnecting')).toBe('Live feed reconnecting')
    expect(describeLiveStatus('off')).toBe('Live feed off')
    expect(describeLiveStatus('connecting')).toBe('Joining the other doors')
  })
})

describe('liveEntryFrom', () => {
  test('reads a row of this event, marks another door, prefers the device clock', () => {
    const e = liveEntryFrom(row({ device_scanned_at: '2026-09-05T08:59:00.000Z', scanned_offline: true }), EVENT, ME)
    expect(e).toEqual({ scanId: SCAN, ticketId: TICKET, result: 'admitted', deviceId: OTHER, at: '2026-09-05T08:59:00.000Z', mine: false, offline: true })
  })
  test('marks this phone\'s own row, and a row with no device as not mine', () => {
    expect(liveEntryFrom(row({ device_id: ME }), EVENT, ME)?.mine).toBe(true)
    expect(liveEntryFrom(row({ device_id: null }), EVENT, ME)?.mine).toBe(false)
  })
  test('drops anything that is not a row of this event with an id, a result and a time', () => {
    expect(liveEntryFrom(null, EVENT, ME)).toBeNull()
    expect(liveEntryFrom(row({ event_id: 'another' }), EVENT, ME)).toBeNull()
    expect(liveEntryFrom(row({ id: 'nope' }), EVENT, ME)).toBeNull()
    expect(liveEntryFrom(row({ result: '' }), EVENT, ME)).toBeNull()
    expect(liveEntryFrom(row({ scanned_at: undefined }), EVENT, ME)).toBeNull()
  })
})

describe('subscribeToDoor', () => {
  test('subscribes to INSERTs on ticket_scans filtered by the event, reports the status, and leaves the channel', async () => {
    const handlers: { on: unknown[]; subscribe: ((status: string, err?: Error) => void)[] } = { on: [], subscribe: [] }
    const channel = {
      on: vi.fn((kind: string, filter: unknown, cb: unknown) => {
        handlers.on.push({ kind, filter, cb })
        return channel
      }),
      subscribe: vi.fn((cb: (status: string, err?: Error) => void) => {
        handlers.subscribe.push(cb)
        return channel
      }),
    }
    const order: string[] = []
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-for-the-socket' } } })) },
      realtime: { setAuth: vi.fn(async (token?: string) => void order.push(`setAuth:${token}`)) },
      channel: vi.fn(() => {
        order.push('channel')
        return channel
      }),
      removeChannel: vi.fn(async () => 'ok'),
    } as unknown as DoorLiveClient
    const rows: unknown[] = []
    const statuses: string[] = []
    const leave = await subscribeToDoor({ client, eventId: EVENT, onRow: (r) => rows.push(r), onStatus: (s, e) => statuses.push(`${s}${e ? `:${e}` : ''}`) })
    // The session token reaches the socket BEFORE the channel is joined (the first B2 drive's finding).
    expect(order).toEqual(['setAuth:jwt-for-the-socket', 'channel'])
    expect(client.channel).toHaveBeenCalledWith(`door:${EVENT}`)
    expect(handlers.on[0]).toMatchObject({ kind: 'postgres_changes', filter: { event: 'INSERT', schema: 'public', table: 'ticket_scans', filter: `event_id=eq.${EVENT}` } })
    ;(handlers.on[0] as { cb: (p: { new: unknown }) => void }).cb({ new: row() })
    expect(rows).toEqual([row()])
    handlers.subscribe[0]('SUBSCRIBED')
    handlers.subscribe[0]('CHANNEL_ERROR', new Error('socket closed'))
    expect(statuses).toEqual(['connecting', 'live', 'reconnecting:socket closed'])
    leave()
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
  })

  test('with no session, the door is told so and no channel is joined', async () => {
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
      realtime: { setAuth: vi.fn() },
      channel: vi.fn(),
      removeChannel: vi.fn(),
    } as unknown as DoorLiveClient
    const statuses: string[] = []
    const leave = await subscribeToDoor({ client, eventId: EVENT, onRow: () => {}, onStatus: (s, e) => statuses.push(`${s}${e ? `:${e}` : ''}`) })
    expect(statuses).toEqual(['connecting', `off:${NO_SESSION_REASON}`])
    expect(client.channel).not.toHaveBeenCalled()
    expect(() => leave()).not.toThrow()
  })
})

describe('applyLiveEntry', () => {
  const entry: LiveEntry = { scanId: SCAN, ticketId: TICKET, result: 'admitted', deviceId: OTHER, at: '2026-09-05T08:59:00.000Z', mine: false, offline: false }
  async function storeWith(status: 'valid' | 'scanned' = 'valid') {
    const store = await DoorStore.open(new IDBFactory())
    await store.replaceTickets(EVENT, [
      { ticketId: TICKET, ticketCode: 'EL-2345-6789', secretHash: 'h', status, holderName: 'Ayesha Rahman', tierName: 'General admission', seatLabel: null, firstScannedAt: null, admittedLocallyAt: null },
    ])
    return store
  }
  test("another door's admission moves the local record to scanned with the row's time", async () => {
    const store = await storeWith()
    const out = await applyLiveEntry(store, EVENT, entry)
    expect(out.changed).toBe(true)
    expect(out.record).toMatchObject({ holderName: 'Ayesha Rahman', status: 'scanned', firstScannedAt: '2026-09-05T08:59:00.000Z' })
    expect(await store.getTicket(EVENT, 'EL-2345-6789')).toMatchObject({ status: 'scanned', firstScannedAt: '2026-09-05T08:59:00.000Z' })
    expect(await store.countCheckedIn(EVENT)).toBe(1)
  })
  test('a record already scanned is left alone, a ticket the list does not hold is reported as unknown', async () => {
    const store = await storeWith('scanned')
    expect((await applyLiveEntry(store, EVENT, entry)).changed).toBe(false)
    expect(await applyLiveEntry(store, EVENT, { ...entry, ticketId: '55555555-5555-4555-8555-555555555555' })).toEqual({ record: null, changed: false })
    expect(await applyLiveEntry(store, EVENT, { ...entry, ticketId: null })).toEqual({ record: null, changed: false })
  })
  test('a not_found row moves nothing', async () => {
    const store = await storeWith()
    expect((await applyLiveEntry(store, EVENT, { ...entry, result: 'not_found', ticketId: null })).changed).toBe(false)
    expect((await store.getTicket(EVENT, 'EL-2345-6789'))?.status).toBe('valid')
  })
})

describe('the words on the strip', () => {
  const record = { ticketId: TICKET, ticketCode: 'EL-2345-6789', secretHash: 'h', status: 'scanned' as const, holderName: 'Ayesha Rahman', tierName: null, seatLabel: null, firstScannedAt: null, admittedLocallyAt: null }
  const base: LiveEntry = { scanId: SCAN, ticketId: TICKET, result: 'admitted', deviceId: OTHER, at: new Date(NOW - 30_000).toISOString(), mine: false, offline: false }
  test('who admitted whom, how long ago, and offline when it was', () => {
    expect(describeLiveEntry(base, record, NOW)).toBe('Door 3F2A admitted Ayesha Rahman just now')
    expect(describeLiveEntry({ ...base, offline: true, at: new Date(NOW - 3 * 60_000).toISOString() }, record, NOW)).toBe('Door 3F2A admitted Ayesha Rahman offline 3 minutes ago')
    expect(describeLiveEntry({ ...base, result: 'already_scanned' }, record, NOW)).toBe('Door 3F2A refused Ayesha Rahman as already used just now')
    expect(describeLiveEntry({ ...base, result: 'not_found', ticketId: null }, null, NOW)).toBe('Door 3F2A refused a code it could not find just now')
    expect(describeLiveEntry({ ...base, result: 'refunded' }, null, NOW)).toBe('Door 3F2A refused a ticket (refunded) just now')
    expect(describeLiveEntry({ ...base, deviceId: null }, record, NOW)).toMatch(/^an unknown door admitted/)
  })
  test('the count line and the feed of other doors, newest first, capped at three', () => {
    expect(checkedInLine(1, 3)).toBe('Checked in 1 of 3')
    expect(checkedInLine(1240, 5000)).toBe('Checked in 1,240 of 5,000')
    const entries: LiveEntry[] = [1, 2, 3, 4, 5].map((i) => ({ ...base, scanId: `${i}${SCAN.slice(1)}`, at: new Date(NOW - i * 1000).toISOString(), mine: i === 2 }))
    const feed = feedFor(entries)
    expect(feed.map((e) => e.scanId[0])).toEqual(['1', '3', '4'])
  })
  test('no dash or exclamation mark in any live line', () => {
    for (const text of [describeLiveStatus('live'), describeLiveStatus('reconnecting'), describeLiveStatus('off'), describeLiveStatus('connecting'), describeLiveEntry(base, record, NOW), checkedInLine(2, 3)]) {
      expect(text).not.toMatch(/[–—!]/)
    }
  })
})
