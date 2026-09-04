import { shortDevice } from '@/lib/scanner/device-id'
import type { DoorReviewRow } from './door-review-types'

/**
 * WHAT THE ORGANISER READS about a ticket that was admitted twice while the
 * doors were offline. Pure, client-safe: the panel renders these words and the
 * tests pin them. No codes to decode, no dashes, no exclamation marks.
 */

const RESULT_WORDS: Record<string, string> = {
  already_scanned: 'had already been admitted',
  refunded: 'had been refunded',
  void: 'had been voided',
  transferred: 'had been transferred away',
  not_found: 'no longer matched a ticket on this event',
  wrong_event: 'belongs to another event',
  invalid: 'was not valid',
}

export function formatReviewTime(iso: string | null, timeZone: string | null): string {
  if (!iso) return 'a time it did not report'
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'a time it did not report'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone ?? undefined,
  })
    .format(when)
    .replace(/\s+/g, ' ')
}

export function describeReviewRow(row: DoorReviewRow, timeZone: string | null): string {
  const what = RESULT_WORDS[row.result] ?? `could not be admitted on the server (${row.result.replace(/_/g, ' ')})`
  const door = shortDevice(row.deviceId)
  const when = formatReviewTime(row.deviceScannedAt ?? row.syncedAt, timeZone)
  const head = `${door} admitted this ticket at ${when} while offline, but on sync the ticket ${what}.`
  if (!row.winner) return head
  const winnerDoor = shortDevice(row.winner.deviceId)
  const winnerWhen = formatReviewTime(row.winner.at, timeZone)
  const how = row.winner.scannedOffline ? 'offline' : 'online'
  return `${head} ${winnerDoor} had admitted it ${how} at ${winnerWhen}.`
}
