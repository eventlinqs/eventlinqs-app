import type { DoorSetMeta, DoorTicketRecord, DoorTicketStatus, QueuedScan, SyncOutcome } from './door-types'

/**
 * THE DOOR LIST ON THE DEVICE (Scope v5 3.13, 5 September 2026).
 *
 * IndexedDB, one database, three stores:
 *
 *   tickets   one row per ticket of every event this phone has opened, keyed
 *             `${eventId}:${ticketCode}` and indexed by event, so 50,000 rows
 *             for one event are a range, not a scan
 *   meta      one row per event: when the set was downloaded, when it expires,
 *             how many tickets, which device this is
 *   queue     one row per scan judged on the device, pending until the sync
 *             records it on the server
 *
 * WHY NOT A LIBRARY. The surface needed is small (open, put in batches, get by
 * key, count and walk an index, delete a range), the Tooling law admits no new
 * UI library without a ruling, and a wrapper the tests can run on fake-indexeddb
 * is thirty lines. Every request is promised through `request` and every
 * transaction through `settle`, so a failure surfaces as a rejection with the
 * database's own error, never as a hang.
 *
 * WHAT IT NEVER STORES: a ticket's secret. The record carries `secretHash`
 * (door-types.ts) and the guard reads this file for the word.
 *
 * WRITES ARE BATCHED. A 50,000 row set is written 1,000 rows per transaction.
 * One transaction for the lot would hold the store for the whole write and, on
 * a low-end phone, trip the browser's transaction watchdog; a thousand at a
 * time settles in well under a second each and the door can start scanning
 * against the rows that have landed.
 */

export const DOOR_DB_NAME = 'eventlinqs-door'
/**
 * 2 since B2 (5 September 2026): the tickets store gained the byTicketId
 * index so a live ticket_scans row, which carries ticket_id, can move the
 * right local record. A phone still on version 1 upgrades in place: the
 * index is added to the existing store and fills as the next download lands.
 */
export const DOOR_DB_VERSION = 2
export const DOOR_WRITE_BATCH = 1000

const TICKETS = 'tickets'
const META = 'meta'
const QUEUE = 'queue'
const BY_EVENT = 'byEvent'
const BY_TICKET_ID = 'byTicketId'

type StoredTicket = DoorTicketRecord & { key: string; eventId: string }

export function ticketKey(eventId: string, ticketCode: string): string {
  return `${eventId}:${ticketCode.trim().toUpperCase()}`
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'))
  })
}

function settle(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/** Walk every row of an index for one key, in key order. */
async function eachInIndex<T>(store: IDBObjectStore, index: string, key: IDBValidKey, visit: (row: T, cursor: IDBCursorWithValue) => void): Promise<void> {
  const cursorRequest = store.index(index).openCursor(IDBKeyRange.only(key))
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }
      visit(cursor.value as T, cursor)
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('IndexedDB cursor failed'))
  })
}

export function openDoorDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DOOR_DB_NAME, DOOR_DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      const upgrade = open.transaction
      let tickets: IDBObjectStore
      if (!db.objectStoreNames.contains(TICKETS)) {
        tickets = db.createObjectStore(TICKETS, { keyPath: 'key' })
        tickets.createIndex(BY_EVENT, 'eventId', { unique: false })
      } else {
        if (!upgrade) throw new Error('the door database upgrade has no transaction')
        tickets = upgrade.objectStore(TICKETS)
      }
      // Records with a null ticketId (a list from before B2) are simply absent from this index.
      if (!tickets.indexNames.contains(BY_TICKET_ID)) tickets.createIndex(BY_TICKET_ID, 'ticketId', { unique: false })
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'eventId' })
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        const queue = db.createObjectStore(QUEUE, { keyPath: 'clientScanId' })
        queue.createIndex(BY_EVENT, 'eventId', { unique: false })
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error ?? new Error('could not open the door database'))
    open.onblocked = () => reject(new Error('the door database is open in another tab and blocked the upgrade'))
  })
}

export class DoorStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory?: IDBFactory): Promise<DoorStore> {
    return new DoorStore(await openDoorDatabase(factory))
  }

  close(): void {
    this.db.close()
  }

  /**
   * Replace the event's set with what the server sent, in batches. A local
   * admission recorded since the last download survives the replacement while
   * the server still says `valid`, so a queue that has not synced yet cannot be
   * undone by a refresh: the same phone would otherwise admit the same ticket
   * twice. Once the server says `scanned` the local mark has done its job.
   */
  async replaceTickets(eventId: string, records: DoorTicketRecord[]): Promise<number> {
    const localAdmits = new Map<string, string>()
    {
      const tx = this.db.transaction(TICKETS, 'readwrite')
      const store = tx.objectStore(TICKETS)
      await eachInIndex<StoredTicket>(store, BY_EVENT, eventId, (row, cursor) => {
        if (row.admittedLocallyAt) localAdmits.set(row.key, row.admittedLocallyAt)
        cursor.delete()
      })
      await settle(tx)
    }
    let written = 0
    for (let i = 0; i < records.length; i += DOOR_WRITE_BATCH) {
      const tx = this.db.transaction(TICKETS, 'readwrite')
      const store = tx.objectStore(TICKETS)
      for (const record of records.slice(i, i + DOOR_WRITE_BATCH)) {
        const key = ticketKey(eventId, record.ticketCode)
        const carried = record.status === 'valid' ? (localAdmits.get(key) ?? record.admittedLocallyAt) : null
        const row: StoredTicket = { ...record, ticketCode: record.ticketCode.toUpperCase(), admittedLocallyAt: carried ?? null, key, eventId }
        store.put(row)
        written += 1
      }
      await settle(tx)
    }
    return written
  }

  async getTicket(eventId: string, ticketCode: string): Promise<DoorTicketRecord | null> {
    const tx = this.db.transaction(TICKETS, 'readonly')
    const row = await request<StoredTicket | undefined>(tx.objectStore(TICKETS).get(ticketKey(eventId, ticketCode)))
    if (!row) return null
    const { key: _key, eventId: _eventId, ...record } = row
    return record
  }

  /** A ticket by its database id, the key a live ticket_scans row carries. */
  async getTicketById(eventId: string, ticketId: string): Promise<DoorTicketRecord | null> {
    const tx = this.db.transaction(TICKETS, 'readonly')
    const rows: StoredTicket[] = []
    await eachInIndex<StoredTicket>(tx.objectStore(TICKETS), BY_TICKET_ID, ticketId, (row) => {
      if (row.eventId === eventId) rows.push(row)
    })
    if (rows.length === 0) return null
    const { key: _key, eventId: _eventId, ...record } = rows[0]
    return record
  }

  /** How many of the event's tickets are through the door, by the server's word or this phone's own admission. */
  async countCheckedIn(eventId: string): Promise<number> {
    let n = 0
    const tx = this.db.transaction(TICKETS, 'readonly')
    await eachInIndex<StoredTicket>(tx.objectStore(TICKETS), BY_EVENT, eventId, (row) => {
      if (row.status === 'scanned' || row.admittedLocallyAt) n += 1
    })
    return n
  }

  async countTickets(eventId: string): Promise<number> {
    const tx = this.db.transaction(TICKETS, 'readonly')
    return request(tx.objectStore(TICKETS).index(BY_EVENT).count(IDBKeyRange.only(eventId)))
  }

  /** This device admitted the ticket at `atIso`; a second scan here is refused from now on. */
  async markAdmittedLocally(eventId: string, ticketCode: string, atIso: string): Promise<void> {
    const tx = this.db.transaction(TICKETS, 'readwrite')
    const store = tx.objectStore(TICKETS)
    const row = await request<StoredTicket | undefined>(store.get(ticketKey(eventId, ticketCode)))
    if (row) store.put({ ...row, admittedLocallyAt: atIso })
    await settle(tx)
  }

  /** The server's word on a ticket, after an online scan or a sync. */
  async applyServerTruth(eventId: string, ticketCode: string, truth: { status: DoorTicketStatus; firstScannedAt: string | null }): Promise<void> {
    const tx = this.db.transaction(TICKETS, 'readwrite')
    const store = tx.objectStore(TICKETS)
    const row = await request<StoredTicket | undefined>(store.get(ticketKey(eventId, ticketCode)))
    if (row) {
      store.put({
        ...row,
        status: truth.status,
        firstScannedAt: truth.firstScannedAt ?? row.firstScannedAt,
        admittedLocallyAt: truth.status === 'scanned' ? null : row.admittedLocallyAt,
      })
    }
    await settle(tx)
  }

  async getMeta(eventId: string): Promise<DoorSetMeta | null> {
    const tx = this.db.transaction(META, 'readonly')
    return (await request<DoorSetMeta | undefined>(tx.objectStore(META).get(eventId))) ?? null
  }

  async putMeta(meta: DoorSetMeta): Promise<void> {
    const tx = this.db.transaction(META, 'readwrite')
    tx.objectStore(META).put(meta)
    await settle(tx)
  }

  async enqueue(scan: QueuedScan): Promise<void> {
    const tx = this.db.transaction(QUEUE, 'readwrite')
    tx.objectStore(QUEUE).put(scan)
    await settle(tx)
  }

  /** Every scan the server has not recorded yet, oldest first. */
  async pendingScans(eventId: string): Promise<QueuedScan[]> {
    const rows: QueuedScan[] = []
    const tx = this.db.transaction(QUEUE, 'readonly')
    await eachInIndex<QueuedScan>(tx.objectStore(QUEUE), BY_EVENT, eventId, (row) => {
      if (row.state === 'pending') rows.push(row)
    })
    return rows.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
  }

  async countPending(eventId: string): Promise<number> {
    return (await this.pendingScans(eventId)).length
  }

  /** Scans the server flagged for the organiser, newest first, so the door can say so. */
  async flaggedScans(eventId: string): Promise<QueuedScan[]> {
    const rows: QueuedScan[] = []
    const tx = this.db.transaction(QUEUE, 'readonly')
    await eachInIndex<QueuedScan>(tx.objectStore(QUEUE), BY_EVENT, eventId, (row) => {
      if (row.state === 'synced' && row.needsReview) rows.push(row)
    })
    return rows.sort((a, b) => (b.syncedAt ?? '').localeCompare(a.syncedAt ?? ''))
  }

  /** Record what the server said about one queued scan. Returns the updated row, or null if the id is unknown here. */
  async recordSyncOutcome(outcome: SyncOutcome, syncedAt: string): Promise<QueuedScan | null> {
    const tx = this.db.transaction(QUEUE, 'readwrite')
    const store = tx.objectStore(QUEUE)
    const row = await request<QueuedScan | undefined>(store.get(outcome.clientScanId))
    if (!row) {
      await settle(tx)
      return null
    }
    const updated: QueuedScan = {
      ...row,
      state: 'synced',
      syncedAt,
      syncedResult: outcome.result,
      needsReview: outcome.needsReview,
      holderName: outcome.holderName ?? row.holderName,
    }
    store.put(updated)
    await settle(tx)
    return updated
  }

  /** Forget everything this phone holds for one event. */
  async clearEvent(eventId: string): Promise<void> {
    const tx = this.db.transaction([TICKETS, META, QUEUE], 'readwrite')
    await eachInIndex<StoredTicket>(tx.objectStore(TICKETS), BY_EVENT, eventId, (_row, cursor) => cursor.delete())
    await eachInIndex<QueuedScan>(tx.objectStore(QUEUE), BY_EVENT, eventId, (_row, cursor) => cursor.delete())
    tx.objectStore(META).delete(eventId)
    await settle(tx)
  }
}
