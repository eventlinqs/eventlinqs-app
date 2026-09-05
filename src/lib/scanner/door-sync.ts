import type { QueuedScan, SyncOutcome } from './door-types'
import { DOOR_SYNC_BATCH_SIZE } from './door-types'
import type { DoorStore } from './door-store'

/**
 * RECONCILING THE QUEUE WITH THE SERVER (Scope v5 3.12: "Validated scans are
 * queued locally and synced when connectivity returns. Conflict resolution: if
 * two scanners validate the same ticket offline, the first sync wins and the
 * second is flagged for manual review.")
 *
 * The decision itself is made by sync_offline_scans on the server, inside the
 * same compare-and-set scan_ticket uses, so this file has no opinion about who
 * won. It shapes the batch the device sends, reads the answer strictly (a
 * malformed answer is an error, never a silent partial), writes the answer back
 * into the queue and the local set, and counts what the door should say.
 */

/** What the RPC takes, one element per queued scan. Snake case because it is the wire. */
export type SyncPayloadItem = {
  client_scan_id: string
  ticket_code: string
  secret_hash: string
  device_id: string
  scanned_at: string
  offline_result: QueuedScan['offlineResult']
}

/** The oldest pending scans, up to one batch. */
export function nextBatch(pending: QueuedScan[], size: number = DOOR_SYNC_BATCH_SIZE): QueuedScan[] {
  return [...pending].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt)).slice(0, size)
}

export function toSyncPayload(scans: QueuedScan[]): SyncPayloadItem[] {
  return scans.map((s) => ({
    client_scan_id: s.clientScanId,
    ticket_code: s.ticketCode,
    secret_hash: s.secretHash,
    device_id: s.deviceId,
    scanned_at: s.scannedAt,
    offline_result: s.offlineResult,
  }))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Read the RPC's jsonb answer. Throws on anything that is not an array of
 * well-formed outcomes: a door that quietly accepted half an answer would leave
 * scans pending forever or, worse, mark them synced on a guess.
 */
export function parseSyncOutcomes(raw: unknown): SyncOutcome[] {
  if (!Array.isArray(raw)) throw new Error('sync answer is not an array')
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`sync answer item ${i} is not an object`)
    const o = item as Record<string, unknown>
    const clientScanId = typeof o.client_scan_id === 'string' ? o.client_scan_id : ''
    if (!UUID_RE.test(clientScanId)) throw new Error(`sync answer item ${i} carries no client_scan_id`)
    if (typeof o.result !== 'string' || !o.result) throw new Error(`sync answer item ${i} carries no result`)
    return {
      clientScanId,
      result: o.result,
      needsReview: o.needs_review === true,
      holderName: typeof o.holder_name === 'string' ? o.holder_name : null,
      firstScannedAt: typeof o.first_scanned_at === 'string' ? o.first_scanned_at : null,
      replayed: o.replayed === true,
    }
  })
}

export type SyncSummary = {
  synced: number
  admitted: number
  needsReview: number
  flagged: SyncOutcome[]
}

export function summariseOutcomes(outcomes: SyncOutcome[]): SyncSummary {
  const flagged = outcomes.filter((o) => o.needsReview)
  return {
    synced: outcomes.length,
    admitted: outcomes.filter((o) => o.result === 'admitted').length,
    needsReview: flagged.length,
    flagged,
  }
}

/** The ticket status the server's result implies for the local record, if any. */
export function statusFromResult(result: string): 'scanned' | 'refunded' | 'void' | 'transferred' | null {
  switch (result) {
    case 'admitted':
    case 'already_scanned':
      return 'scanned'
    case 'refunded':
    case 'void':
    case 'transferred':
      return result
    default:
      return null
  }
}

/** Write the server's answer into the queue and the local set. */
export async function applySyncOutcomes(store: DoorStore, eventId: string, outcomes: SyncOutcome[], syncedAt: string): Promise<SyncSummary> {
  for (const outcome of outcomes) {
    const row = await store.recordSyncOutcome(outcome, syncedAt)
    if (!row) continue
    const status = statusFromResult(outcome.result)
    if (status) await store.applyServerTruth(eventId, row.ticketCode, { status, firstScannedAt: outcome.firstScannedAt })
  }
  return summariseOutcomes(outcomes)
}
