import type { DoorOutcome, DoorSetMeta, DoorTicketRecord } from './door-types'
import { DOOR_SET_VALID_FOR_MS } from './door-types'

/**
 * THE DEVICE'S OWN JUDGEMENT, when the network is gone (Scope v5 3.12, 3.13).
 *
 * Pure: the store hands in the record and the meta, the scanner hands in the
 * hash of what was scanned and the clock, and this answers. It mirrors the
 * diagnosis order of the scan_ticket RPC exactly, so a door reads the same words
 * online and offline:
 *
 *   no record, or the hash does not match   not_found   (never a secret oracle)
 *   admitted on this device already          already_scanned, with the time
 *   scanned on the server                    already_scanned, with the time
 *   refunded, void, transferred              each its own word
 *   valid                                    admitted
 *   anything else                            invalid    (fail closed)
 *
 * and ONE rule the server does not need: a set older than 24 hours admits
 * nobody (stale_set). The scope fixes the window and the door is told to
 * reconnect rather than let people in on yesterday's list.
 *
 * What it cannot see, plainly: a scan on ANOTHER device since the download.
 * That is what the sync reconciles, and why "first sync wins, the second is
 * flagged" lives in sync_offline_scans rather than here.
 */

/** SHA-256 as lowercase hex, through WebCrypto. The same call in Node 20+ and every browser the door runs in. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type SetState = { state: 'ready' | 'expired' | 'none'; msRemaining: number }

/** Is the downloaded set still inside its 24 hours at `now`? */
export function setState(meta: DoorSetMeta | null | undefined, now: number = Date.now()): SetState {
  if (!meta) return { state: 'none', msRemaining: 0 }
  const expires = new Date(meta.expiresAt).getTime()
  if (Number.isNaN(expires)) return { state: 'expired', msRemaining: 0 }
  const remaining = expires - now
  return remaining > 0 ? { state: 'ready', msRemaining: remaining } : { state: 'expired', msRemaining: 0 }
}

/** The moment a set downloaded at `downloadedAt` stops being trusted, ISO. */
export function expiryFor(downloadedAt: string): string {
  return new Date(new Date(downloadedAt).getTime() + DOOR_SET_VALID_FOR_MS).toISOString()
}

export type OfflineInput = {
  record: DoorTicketRecord | null
  /** SHA-256 hex of the scanned secret. */
  secretHash: string
  meta: DoorSetMeta | null
  now?: number
}

/**
 * Judge one scan against the local set. Every path returns a DoorOutcome with
 * judgedBy 'device', so the result card can say so.
 */
export function validateOffline({ record, secretHash, meta, now = Date.now() }: OfflineInput): DoorOutcome {
  const base = { holderName: null, tierName: null, seatLabel: null, firstScannedAt: null, judgedBy: 'device' as const }

  if (setState(meta, now).state !== 'ready') {
    return { ...base, result: 'stale_set' }
  }
  if (!record || record.secretHash.toLowerCase() !== secretHash.toLowerCase()) {
    return { ...base, result: 'not_found' }
  }

  const known = {
    holderName: record.holderName,
    tierName: record.tierName,
    seatLabel: record.seatLabel,
    judgedBy: 'device' as const,
  }

  if (record.admittedLocallyAt) {
    return { ...known, result: 'already_scanned', firstScannedAt: record.firstScannedAt ?? record.admittedLocallyAt }
  }
  switch (record.status) {
    case 'scanned':
      return { ...known, result: 'already_scanned', firstScannedAt: record.firstScannedAt }
    case 'refunded':
      return { ...known, result: 'refunded', firstScannedAt: record.firstScannedAt }
    case 'void':
      return { ...known, result: 'void', firstScannedAt: record.firstScannedAt }
    case 'transferred':
      return { ...known, result: 'transferred', firstScannedAt: record.firstScannedAt }
    case 'valid':
      return { ...known, result: 'admitted', firstScannedAt: null }
    default:
      return { ...known, result: 'invalid', firstScannedAt: record.firstScannedAt }
  }
}
