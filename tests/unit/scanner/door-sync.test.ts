import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, test } from 'vitest'
import { nextBatch, toSyncPayload, parseSyncOutcomes, summariseOutcomes, statusFromResult, applySyncOutcomes } from '@/lib/scanner/door-sync'
import { DoorStore } from '@/lib/scanner/door-store'
import { DOOR_SYNC_BATCH_SIZE, type QueuedScan } from '@/lib/scanner/door-types'

const EVENT = 'event-1'

function queued(i: number, over: Partial<QueuedScan> = {}): QueuedScan {
  return {
    clientScanId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    eventId: EVENT,
    ticketCode: `EL-2345-${String(6789 + i)}`,
    secretHash: `hash-${i}`,
    scannedAt: new Date(Date.parse('2026-09-05T09:00:00.000Z') + i * 1000).toISOString(),
    deviceId: 'device-a',
    offlineResult: 'admitted',
    holderName: `Guest ${i}`,
    state: 'pending',
    ...over,
  }
}

describe('nextBatch and toSyncPayload', () => {
  test('takes the oldest scans first, up to one batch', () => {
    const pending = Array.from({ length: DOOR_SYNC_BATCH_SIZE + 5 }, (_, i) => queued(DOOR_SYNC_BATCH_SIZE + 5 - i))
    const batch = nextBatch(pending)
    expect(batch).toHaveLength(DOOR_SYNC_BATCH_SIZE)
    expect(batch[0].clientScanId).toBe(queued(1).clientScanId)
    expect(batch[batch.length - 1].clientScanId).toBe(queued(DOOR_SYNC_BATCH_SIZE).clientScanId)
  })

  test('the wire shape is snake case and carries no secret', () => {
    const [item] = toSyncPayload([queued(1)])
    expect(item).toEqual({
      client_scan_id: queued(1).clientScanId,
      ticket_code: 'EL-2345-6790',
      secret_hash: 'hash-1',
      device_id: 'device-a',
      scanned_at: queued(1).scannedAt,
      offline_result: 'admitted',
    })
    expect(JSON.stringify(item)).not.toMatch(/"secret"/)
  })
})

describe('parseSyncOutcomes', () => {
  const good = {
    client_scan_id: queued(1).clientScanId,
    result: 'admitted',
    needs_review: false,
    holder_name: 'Robin Ashe',
    first_scanned_at: '2026-09-05T09:00:01.000Z',
    replayed: false,
  }

  test('reads a well-formed answer', () => {
    expect(parseSyncOutcomes([good])).toEqual([
      { clientScanId: queued(1).clientScanId, result: 'admitted', needsReview: false, holderName: 'Robin Ashe', firstScannedAt: '2026-09-05T09:00:01.000Z', replayed: false },
    ])
  })

  test('nulls are carried as nulls and flags as booleans', () => {
    const [o] = parseSyncOutcomes([{ ...good, holder_name: null, first_scanned_at: null, needs_review: true, replayed: true }])
    expect(o).toMatchObject({ holderName: null, firstScannedAt: null, needsReview: true, replayed: true })
  })

  test('refuses a non-array, an item with no id, and an item with no result, rather than half-applying', () => {
    expect(() => parseSyncOutcomes({ ok: true })).toThrow(/not an array/)
    expect(() => parseSyncOutcomes([{ ...good, client_scan_id: 'nope' }])).toThrow(/client_scan_id/)
    expect(() => parseSyncOutcomes([{ ...good, result: '' }])).toThrow(/result/)
    expect(() => parseSyncOutcomes([null])).toThrow(/not an object/)
  })
})

describe('summariseOutcomes and statusFromResult', () => {
  test('counts admitted and flagged', () => {
    const s = summariseOutcomes([
      { clientScanId: 'a', result: 'admitted', needsReview: false, holderName: null, firstScannedAt: null, replayed: false },
      { clientScanId: 'b', result: 'already_scanned', needsReview: true, holderName: null, firstScannedAt: null, replayed: false },
      { clientScanId: 'c', result: 'not_found', needsReview: false, holderName: null, firstScannedAt: null, replayed: false },
    ])
    expect(s).toMatchObject({ synced: 3, admitted: 1, needsReview: 1 })
    expect(s.flagged.map((f) => f.clientScanId)).toEqual(['b'])
  })

  test('the local record follows the server result', () => {
    expect(statusFromResult('admitted')).toBe('scanned')
    expect(statusFromResult('already_scanned')).toBe('scanned')
    expect(statusFromResult('refunded')).toBe('refunded')
    expect(statusFromResult('void')).toBe('void')
    expect(statusFromResult('transferred')).toBe('transferred')
    expect(statusFromResult('not_found')).toBeNull()
    expect(statusFromResult('wrong_event')).toBeNull()
  })
})

describe('applySyncOutcomes', () => {
  test('marks the queue synced and moves the local records to what the server said', async () => {
    const store = await DoorStore.open(new IDBFactory())
    await store.replaceTickets(EVENT, [
      { ticketId: null, ticketCode: 'EL-2345-6790', secretHash: 'hash-1', status: 'valid', holderName: 'Guest 1', tierName: null, seatLabel: null, firstScannedAt: null, admittedLocallyAt: '2026-09-05T09:00:01.000Z' },
      { ticketId: null, ticketCode: 'EL-2345-6791', secretHash: 'hash-2', status: 'valid', holderName: 'Guest 2', tierName: null, seatLabel: null, firstScannedAt: null, admittedLocallyAt: '2026-09-05T09:00:02.000Z' },
    ])
    await store.enqueue(queued(1))
    await store.enqueue(queued(2))

    const summary = await applySyncOutcomes(
      store,
      EVENT,
      [
        { clientScanId: queued(1).clientScanId, result: 'admitted', needsReview: false, holderName: 'Guest 1', firstScannedAt: '2026-09-05T09:00:01.000Z', replayed: false },
        { clientScanId: queued(2).clientScanId, result: 'already_scanned', needsReview: true, holderName: 'Guest 2', firstScannedAt: '2026-09-05T08:59:00.000Z', replayed: false },
        { clientScanId: '00000000-0000-4000-8000-999999999999', result: 'admitted', needsReview: false, holderName: null, firstScannedAt: null, replayed: false },
      ],
      '2026-09-05T09:30:00.000Z',
    )

    expect(summary).toMatchObject({ synced: 3, admitted: 2, needsReview: 1 })
    expect(await store.countPending(EVENT)).toBe(0)
    expect(await store.getTicket(EVENT, 'EL-2345-6790')).toMatchObject({ status: 'scanned', firstScannedAt: '2026-09-05T09:00:01.000Z', admittedLocallyAt: null })
    expect(await store.getTicket(EVENT, 'EL-2345-6791')).toMatchObject({ status: 'scanned', firstScannedAt: '2026-09-05T08:59:00.000Z' })
    expect((await store.flaggedScans(EVENT)).map((f) => f.clientScanId)).toEqual([queued(2).clientScanId])
  })
})
