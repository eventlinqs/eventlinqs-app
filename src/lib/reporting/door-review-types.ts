/**
 * The shape of one flagged door scan, shared by the server reader
 * (door-review.ts), the words (door-review-copy.ts) and the panel. No imports,
 * so a client component can take it without pulling server code.
 */
export interface DoorReviewRow {
  scanId: string
  ticketCode: string | null
  holderName: string | null
  /** What the server diagnosed at sync time: already_scanned, refunded, not_found, ... */
  result: string
  /** The door that admitted the person this row is about. */
  deviceId: string | null
  /** That door's own clock at the scan, ISO, or null if it did not say. */
  deviceScannedAt: string | null
  /** When the server recorded it (the sync), ISO. */
  syncedAt: string
  /** The admission that won, if the ticket was admitted at all. */
  winner: { deviceId: string | null; at: string; scannedOffline: boolean } | null
}
