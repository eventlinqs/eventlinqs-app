import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { DoorStore, ticketKey, DOOR_WRITE_BATCH } from '@/lib/scanner/door-store'
import type { DoorTicketRecord, QueuedScan } from '@/lib/scanner/door-types'

/**
 * The door list on the device, run against a real IndexedDB implementation
 * (fake-indexeddb) rather than a mock of our own wrapper, so the batching, the
 * index ranges and the cursors are exercised as the browser will run them.
 */

const EVENT = 'event-1'
const OTHER = 'event-2'

function record(i: number, over: Partial<DoorTicketRecord> = {}): DoorTicketRecord {
  return {
    ticketId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ticketCode: `EL-${String(i).padStart(4, '0')}-${String(i).padStart(4, '0')}`,
    secretHash: `hash-${i}`,
    status: 'valid',
    holderName: `Guest ${i}`,
    tierName: 'General admission',
    seatLabel: null,
    firstScannedAt: null,
    admittedLocallyAt: null,
    ...over,
  }
}

function queued(i: number, over: Partial<QueuedScan> = {}): QueuedScan {
  return {
    clientScanId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    eventId: EVENT,
    ticketCode: record(i).ticketCode,
    secretHash: `hash-${i}`,
    scannedAt: new Date(Date.parse('2026-09-05T09:00:00.000Z') + i * 1000).toISOString(),
    deviceId: 'device-a',
    offlineResult: 'admitted',
    holderName: `Guest ${i}`,
    state: 'pending',
    ...over,
  }
}

let store: DoorStore

beforeEach(async () => {
  store = await DoorStore.open(new IDBFactory())
})

describe('the ticket set', () => {
  test('writes more rows than one batch, counts them, and finds one by code regardless of case', async () => {
    const rows = Array.from({ length: DOOR_WRITE_BATCH * 2 + 500 }, (_, i) => record(i + 1))
    expect(await store.replaceTickets(EVENT, rows)).toBe(rows.length)
    expect(await store.countTickets(EVENT)).toBe(rows.length)
    const found = await store.getTicket(EVENT, rows[7].ticketCode.toLowerCase())
    expect(found?.holderName).toBe('Guest 8')
    expect(found).not.toHaveProperty('key')
    expect(found).not.toHaveProperty('eventId')
  })

  test('a second download replaces the set rather than adding to it', async () => {
    await store.replaceTickets(EVENT, [record(1), record(2), record(3)])
    await store.replaceTickets(EVENT, [record(4)])
    expect(await store.countTickets(EVENT)).toBe(1)
    expect(await store.getTicket(EVENT, record(1).ticketCode)).toBeNull()
  })

  test('sets for two events do not touch each other', async () => {
    await store.replaceTickets(EVENT, [record(1), record(2)])
    await store.replaceTickets(OTHER, [record(1)])
    expect(await store.countTickets(EVENT)).toBe(2)
    expect(await store.countTickets(OTHER)).toBe(1)
    await store.clearEvent(OTHER)
    expect(await store.countTickets(EVENT)).toBe(2)
    expect(await store.countTickets(OTHER)).toBe(0)
  })

  test('a local admission survives a refresh while the server still says valid', async () => {
    await store.replaceTickets(EVENT, [record(1)])
    await store.markAdmittedLocally(EVENT, record(1).ticketCode, '2026-09-05T09:05:00.000Z')
    await store.replaceTickets(EVENT, [record(1)])
    expect((await store.getTicket(EVENT, record(1).ticketCode))?.admittedLocallyAt).toBe('2026-09-05T09:05:00.000Z')
  })

  test('a local admission is dropped once the server says scanned', async () => {
    await store.replaceTickets(EVENT, [record(1)])
    await store.markAdmittedLocally(EVENT, record(1).ticketCode, '2026-09-05T09:05:00.000Z')
    await store.replaceTickets(EVENT, [record(1, { status: 'scanned', firstScannedAt: '2026-09-05T09:05:00.000Z' })])
    const row = await store.getTicket(EVENT, record(1).ticketCode)
    expect(row?.status).toBe('scanned')
    expect(row?.admittedLocallyAt).toBeNull()
  })

  test('applyServerTruth moves the status and clears the local mark on scanned', async () => {
    await store.replaceTickets(EVENT, [record(1)])
    await store.markAdmittedLocally(EVENT, record(1).ticketCode, '2026-09-05T09:05:00.000Z')
    await store.applyServerTruth(EVENT, record(1).ticketCode, { status: 'scanned', firstScannedAt: '2026-09-05T09:04:00.000Z' })
    const row = await store.getTicket(EVENT, record(1).ticketCode)
    expect(row).toMatchObject({ status: 'scanned', firstScannedAt: '2026-09-05T09:04:00.000Z', admittedLocallyAt: null })
  })

  test('applyServerTruth on a refunded ticket keeps the local mark for the audit', async () => {
    await store.replaceTickets(EVENT, [record(1)])
    await store.markAdmittedLocally(EVENT, record(1).ticketCode, '2026-09-05T09:05:00.000Z')
    await store.applyServerTruth(EVENT, record(1).ticketCode, { status: 'refunded', firstScannedAt: null })
    const row = await store.getTicket(EVENT, record(1).ticketCode)
    expect(row?.status).toBe('refunded')
    expect(row?.admittedLocallyAt).toBe('2026-09-05T09:05:00.000Z')
  })

  test('the key is the event and the upper-cased code', () => {
    expect(ticketKey('e', ' el-2345-6789 ')).toBe('e:EL-2345-6789')
  })
})

describe('the meta row', () => {
  test('round-trips and is null before a download', async () => {
    expect(await store.getMeta(EVENT)).toBeNull()
    const meta = { eventId: EVENT, eventTitle: 'Open Field Party', downloadedAt: 'a', expiresAt: 'b', ticketCount: 3, deviceId: 'device-a', version: 1 as const }
    await store.putMeta(meta)
    expect(await store.getMeta(EVENT)).toEqual(meta)
  })
})

describe('the queue', () => {
  test('pending scans come back oldest first, and only the pending ones', async () => {
    await store.enqueue(queued(3))
    await store.enqueue(queued(1))
    await store.enqueue(queued(2, { state: 'synced', syncedAt: 'x', syncedResult: 'admitted' }))
    const pending = await store.pendingScans(EVENT)
    expect(pending.map((p) => p.clientScanId)).toEqual([queued(1).clientScanId, queued(3).clientScanId])
    expect(await store.countPending(EVENT)).toBe(2)
  })

  test('recordSyncOutcome marks a scan synced with what the server said, and returns null for an id it does not hold', async () => {
    await store.enqueue(queued(1))
    const updated = await store.recordSyncOutcome(
      { clientScanId: queued(1).clientScanId, result: 'already_scanned', needsReview: true, holderName: 'Robin Ashe', firstScannedAt: null, replayed: false },
      '2026-09-05T09:30:00.000Z',
    )
    expect(updated).toMatchObject({ state: 'synced', syncedAt: '2026-09-05T09:30:00.000Z', syncedResult: 'already_scanned', needsReview: true, holderName: 'Robin Ashe' })
    expect(await store.countPending(EVENT)).toBe(0)
    expect(
      await store.recordSyncOutcome({ clientScanId: '00000000-0000-4000-8000-999999999999', result: 'admitted', needsReview: false, holderName: null, firstScannedAt: null, replayed: false }, 'x'),
    ).toBeNull()
  })

  test('flaggedScans lists what needs review, newest sync first', async () => {
    await store.enqueue(queued(1))
    await store.enqueue(queued(2))
    await store.enqueue(queued(3))
    await store.recordSyncOutcome({ clientScanId: queued(1).clientScanId, result: 'already_scanned', needsReview: true, holderName: null, firstScannedAt: null, replayed: false }, '2026-09-05T09:30:00.000Z')
    await store.recordSyncOutcome({ clientScanId: queued(2).clientScanId, result: 'admitted', needsReview: false, holderName: null, firstScannedAt: null, replayed: false }, '2026-09-05T09:31:00.000Z')
    await store.recordSyncOutcome({ clientScanId: queued(3).clientScanId, result: 'refunded', needsReview: true, holderName: null, firstScannedAt: null, replayed: false }, '2026-09-05T09:32:00.000Z')
    expect((await store.flaggedScans(EVENT)).map((f) => f.clientScanId)).toEqual([queued(3).clientScanId, queued(1).clientScanId])
  })

  test('clearEvent forgets the tickets, the meta and the queue for that event only', async () => {
    await store.replaceTickets(EVENT, [record(1)])
    await store.putMeta({ eventId: EVENT, eventTitle: 't', downloadedAt: 'a', expiresAt: 'b', ticketCount: 1, deviceId: 'd', version: 1 })
    await store.enqueue(queued(1))
    await store.enqueue(queued(2, { eventId: OTHER }))
    await store.clearEvent(EVENT)
    expect(await store.countTickets(EVENT)).toBe(0)
    expect(await store.getMeta(EVENT)).toBeNull()
    expect(await store.countPending(EVENT)).toBe(0)
    expect(await store.countPending(OTHER)).toBe(1)
  })
})
