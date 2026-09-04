/**
 * THE DOOR'S OFFLINE SHAPES (Scope v5 3.12 and 3.13, 5 September 2026).
 *
 * Everything the scanner keeps on the device lives in these types, and one rule
 * governs all of them: THE DEVICE NEVER HOLDS A TICKET'S SECRET. The bearer QR
 * encodes `/t/<code>?k=<secret>`; the cached set carries `secretHash`, a SHA-256
 * of that secret computed by the database, and the device hashes what it scans
 * and compares. A stolen phone with a downloaded door list cannot forge a
 * single ticket from it. scripts/guards/offline-door-integrity.mjs refuses a
 * record type that grows a `secret` field.
 *
 * Client-safe: no server imports, so the scanner component, the store, the
 * validator and the tests all read one definition.
 */

/** The ticket statuses the database issues (tickets.status CHECK). */
export type DoorTicketStatus = 'valid' | 'scanned' | 'refunded' | 'void' | 'transferred'

/**
 * The result codes a scan can end in. The first eight are the ticket_scans
 * CHECK on the server and mean the same thing here. `stale_set` is the device's
 * own refusal: the door list is more than a day old (Scope v5 3.13, "cache is
 * valid for 24 hours from download"), so it will not admit on it. It is never
 * sent to the server, because it is not a judgement about the ticket.
 */
export type ScanResultCode =
  | 'admitted'
  | 'already_scanned'
  | 'invalid'
  | 'wrong_event'
  | 'refunded'
  | 'void'
  | 'transferred'
  | 'not_found'
  | 'stale_set'

/** One ticket in the downloaded door list. */
export type DoorTicketRecord = {
  /** The database id, so a live ticket_scans row (which carries ticket_id) can be matched. Null on a list downloaded before B2. */
  ticketId: string | null
  ticketCode: string
  /** SHA-256 hex of the bearer secret, computed by the database. Never the secret. */
  secretHash: string
  status: DoorTicketStatus
  holderName: string | null
  tierName: string | null
  seatLabel: string | null
  /** The server's first admission time at download, or from a later sync. */
  firstScannedAt: string | null
  /** This device admitted the ticket (offline or online) since the download. */
  admittedLocallyAt: string | null
}

/** What the scanner knows about the set it holds for one event. */
export type DoorSetMeta = {
  eventId: string
  eventTitle: string
  /** Server time at download, ISO. */
  downloadedAt: string
  /** downloadedAt plus DOOR_SET_VALID_FOR_MS, ISO. */
  expiresAt: string
  ticketCount: number
  deviceId: string
  /** The store's shape version. B4 (per-event signing keys) raises it. */
  version: 1
}

/** A scan judged on the device and waiting to be, or already, reconciled. */
export type QueuedScan = {
  /** Minted on the device; the server's idempotency key for a retried sync. */
  clientScanId: string
  eventId: string
  ticketCode: string
  secretHash: string
  /** The device clock when the scan happened, ISO. */
  scannedAt: string
  deviceId: string
  /** What this device decided at the door. */
  offlineResult: Exclude<ScanResultCode, 'stale_set'>
  holderName: string | null
  state: 'pending' | 'synced'
  /** Filled by the sync. */
  syncedAt?: string
  syncedResult?: string
  needsReview?: boolean
}

/** One line of the sync's answer, as the server returns it. */
export type SyncOutcome = {
  clientScanId: string
  result: string
  needsReview: boolean
  holderName: string | null
  firstScannedAt: string | null
  /** True when the server had already recorded this scan (a retried batch). */
  replayed: boolean
}

/** What the validator (device or server) hands the result card. */
export type DoorOutcome = {
  result: ScanResultCode
  holderName: string | null
  tierName: string | null
  seatLabel: string | null
  firstScannedAt: string | null
  judgedBy: 'server' | 'device'
}

/**
 * One ticket_scans row as it arrives on the live channel (B2), reduced to what
 * a door needs: which door, which ticket, what happened, when, and whether it
 * was this phone's own scan echoing back.
 */
export type LiveEntry = {
  scanId: string
  ticketId: string | null
  result: string
  deviceId: string | null
  /** The device clock when the scan happened, else the server's record of it, ISO. */
  at: string
  mine: boolean
  offline: boolean
}

/** How many other doors' scans the strip shows. */
export const DOOR_LIVE_FEED_LENGTH = 3

/** Scope v5 3.13: "Cache is valid for 24 hours from download." */
export const DOOR_SET_VALID_FOR_MS = 24 * 60 * 60 * 1000

/** Scope v5 3.13: "Supports up to 50,000 tickets in the local cache." */
export const DOOR_SET_MAX_TICKETS = 50_000

/** One page of the download. The RPC clamps to this as well. */
export const DOOR_SET_PAGE_SIZE = 5000

/** One sync batch. The RPC refuses more than 500 in one call. */
export const DOOR_SYNC_BATCH_SIZE = 200

/**
 * The cache the scanner shell lives in. `public/scan-sw.js` opens the SAME name,
 * and tests/unit/scanner/scan-service-worker.test.ts fails if the two drift.
 */
export const DOOR_SHELL_CACHE = 'eventlinqs-door-shell-v1'

/** Where the service worker file lives and what it controls. */
export const DOOR_SERVICE_WORKER_URL = '/scan-sw.js'
export const DOOR_SERVICE_WORKER_SCOPE = '/scan/'
