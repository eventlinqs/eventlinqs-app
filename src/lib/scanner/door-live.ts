import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DoorTicketRecord, LiveEntry } from './door-types'
import { DOOR_LIVE_FEED_LENGTH } from './door-types'
import type { DoorStore } from './door-store'
import { statusFromResult } from './door-sync'
import { describeHowLongAgo } from './result'
import { shortDevice } from './device-id'

/**
 * TWO DOORS SEE EACH OTHER (Scope v5 3.13: "multiple staff scanning
 * simultaneously, synchronised in real-time via Supabase Realtime").
 *
 * Every admission on every path is one INSERT on ticket_scans (scan_ticket
 * online, sync_offline_scans on reconnect), and migration 20260905000002 puts
 * that table in the supabase_realtime publication. A door subscribes to the
 * INSERTs on its event; Supabase authorises every row against the subscriber's
 * JWT through the table's own SELECT policy, so a door receives its event's
 * rows and a stranger receives nothing
 * (https://supabase.com/docs/guides/realtime/postgres-changes, fetched
 * 5 September 2026).
 *
 * What a live row does on the phone: an admitted or already_scanned row moves
 * the LOCAL record to scanned by ticket id, so if this door's signal drops a
 * minute later and someone presents the same ticket, the door list already
 * knows and refuses it, with no sync in between. That is the point of the
 * feature: the door list stops being a snapshot.
 */

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'off'

/** The minimum of the Supabase client this module touches, so the scanner and the tests can hand in either. */
export type DoorLiveClient = {
  channel: (name: string, opts?: { config?: Record<string, unknown> }) => RealtimeChannel
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>
}

/** One channel per event; the name is what the drive and the verify script look for. */
export function doorChannelName(eventId: string): string {
  return `door:${eventId}`
}

/** Supabase's subscribe statuses, in the door's words. */
export function mapStatus(status: string): LiveStatus {
  switch (status) {
    case 'SUBSCRIBED':
      return 'live'
    case 'CLOSED':
      return 'off'
    case 'CHANNEL_ERROR':
    case 'TIMED_OUT':
      return 'reconnecting'
    default:
      return 'connecting'
  }
}

export function describeLiveStatus(status: LiveStatus): string {
  switch (status) {
    case 'live':
      return 'Live with the other doors'
    case 'reconnecting':
      return 'Live feed reconnecting'
    case 'off':
      return 'Live feed off'
    default:
      return 'Joining the other doors'
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Read one ticket_scans row off the wire, strictly. Anything that is not a
 * row of this event with an id and a result is dropped, and the drop is
 * returned as null so the caller can count it rather than guess.
 */
export function liveEntryFrom(row: unknown, eventId: string, deviceId: string): LiveEntry | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) return null
  if (r.event_id !== eventId) return null
  if (typeof r.result !== 'string' || !r.result) return null
  const at = typeof r.device_scanned_at === 'string' ? r.device_scanned_at : typeof r.scanned_at === 'string' ? r.scanned_at : null
  if (!at) return null
  const device = typeof r.device_id === 'string' && r.device_id ? r.device_id : null
  return {
    scanId: r.id,
    ticketId: typeof r.ticket_id === 'string' ? r.ticket_id : null,
    result: r.result,
    deviceId: device,
    at,
    mine: device !== null && device === deviceId,
    offline: r.scanned_offline === true,
  }
}

/**
 * Subscribe to the event's admissions. Returns the function that leaves the
 * channel. `onRow` receives the raw new row; `onStatus` the door's word for
 * the channel's state, with the error text when there is one.
 */
export function subscribeToDoor(opts: {
  client: DoorLiveClient
  eventId: string
  onRow: (row: unknown) => void
  onStatus: (status: LiveStatus, error: string | null) => void
}): () => void {
  const { client, eventId, onRow, onStatus } = opts
  onStatus('connecting', null)
  const channel = client
    .channel(doorChannelName(eventId))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ticket_scans', filter: `event_id=eq.${eventId}` },
      (payload: { new: unknown }) => onRow(payload.new),
    )
    .subscribe((status: string, err?: Error) => {
      onStatus(mapStatus(status), err ? err.message : null)
    })
  return () => {
    void client.removeChannel(channel)
  }
}

/**
 * Move the local record a live row is about. Returns the record after the
 * move (or as found), and whether it changed, so the caller can count
 * admissions and write the feed line with the holder's name.
 */
export async function applyLiveEntry(
  store: DoorStore,
  eventId: string,
  entry: LiveEntry,
): Promise<{ record: DoorTicketRecord | null; changed: boolean }> {
  if (!entry.ticketId) return { record: null, changed: false }
  const record = await store.getTicketById(eventId, entry.ticketId)
  if (!record) return { record: null, changed: false }
  const status = statusFromResult(entry.result)
  if (!status || record.status === status) return { record, changed: false }
  await store.applyServerTruth(eventId, record.ticketCode, { status, firstScannedAt: record.firstScannedAt ?? entry.at })
  return { record: { ...record, status, firstScannedAt: record.firstScannedAt ?? entry.at }, changed: true }
}

/** "Door 3F2A admitted Ayesha Rahman just now", or the refusal in the same shape. */
export function describeLiveEntry(entry: LiveEntry, record: DoorTicketRecord | null, now: number = Date.now()): string {
  const door = shortDevice(entry.deviceId)
  const who = record?.holderName ?? record?.ticketCode ?? 'a ticket'
  const ago = describeHowLongAgo(entry.at, now) ?? 'just now'
  const how = entry.offline ? ' offline' : ''
  switch (entry.result) {
    case 'admitted':
      return `${door} admitted ${who}${how} ${ago}`
    case 'already_scanned':
      return `${door} refused ${who} as already used ${ago}`
    case 'not_found':
      return `${door} refused a code it could not find ${ago}`
    default:
      return `${door} refused ${who} (${entry.result.replace(/_/g, ' ')}) ${ago}`
  }
}

/** "Checked in 1 of 3" for the strip. */
export function checkedInLine(checkedIn: number, total: number): string {
  const n = new Intl.NumberFormat('en-AU')
  return `Checked in ${n.format(checkedIn)} of ${n.format(total)}`
}

/** The newest entries from OTHER doors, most recent first, capped for the strip. */
export function feedFor(entries: LiveEntry[], limit: number = DOOR_LIVE_FEED_LENGTH): LiveEntry[] {
  return entries
    .filter((e) => !e.mine)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
}
