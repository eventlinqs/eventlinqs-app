'use client'

import 'client-only'
import type { DoorOutcome, DoorSetMeta, SyncOutcome } from './door-types'
import type { SyncSummary } from './door-sync'
import { describeScanResult, describeHowLongAgo, type ScanResultView } from './result'
import { setState } from './offline-validate'

/**
 * THE WORDS ON THE DOOR (Copy law: Australian English, no dashes, no
 * exclamation marks, short enough to read with a queue waiting).
 *
 * Times are the device's own clock in the device's own zone, because the door
 * is where the phone is; the server's zone is irrelevant to someone standing at
 * a gate in Geelong. That is why this module is CLIENT ONLY, and says so twice:
 * the 'use client' marker and the `client-only` import, which is Next's own
 * refusal should a server component ever import it. The formatters below name
 * the device's zone explicitly, because tests/unit/dashboard/no-clock-during-
 * render treats a formatter with no timeZone as a hydration mismatch, and a
 * named zone is also the honest statement of whose clock this is.
 */

const count = new Intl.NumberFormat('en-AU')
/*
 * THE PHONE'S OWN ZONE, named rather than implied. The scanner never renders a
 * time on the server (it holds no door list there, so the strip says the list
 * is downloading), so hydration cannot disagree; the zone is spelled out so the
 * no-clock rule can see it, and so a reader knows it is the device's zone, not
 * the event's.
 */
const DEVICE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const clock = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: DEVICE_ZONE })
const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: DEVICE_ZONE })

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "4:12 pm", "tomorrow 4:12 pm", or "Sat 4:12 pm", read against `now`. */
export function formatClock(iso: string, now: number = Date.now()): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const today = new Date(now)
  const time = clock.format(when).replace(/\s+/g, ' ')
  if (sameLocalDay(when, today)) return time
  const tomorrow = new Date(now + 24 * 60 * 60 * 1000)
  if (sameLocalDay(when, tomorrow)) return `tomorrow ${time}`
  const yesterday = new Date(now - 24 * 60 * 60 * 1000)
  if (sameLocalDay(when, yesterday)) return `yesterday ${time}`
  return `${weekday.format(when)} ${time}`
}

export function pluralTickets(n: number): string {
  return `${count.format(n)} ticket${n === 1 ? '' : 's'}`
}

export function pluralScans(n: number): string {
  return `${count.format(n)} scan${n === 1 ? '' : 's'}`
}

export const STALE_SET_REASON = 'Door list is more than a day old'

/** The one line under the event title that says what this phone can do right now. */
export function describeSet(meta: DoorSetMeta | null, ticketCount: number, now: number = Date.now()): string {
  const { state } = setState(meta, now)
  if (!meta || state === 'none') return 'Downloading the door list for offline scanning.'
  if (state === 'expired') return `${STALE_SET_REASON}. Refresh it to keep scanning offline.`
  return `Offline ready. ${pluralTickets(ticketCount)}, downloaded ${formatClock(meta.downloadedAt, now)}, valid until ${formatClock(meta.expiresAt, now)}.`
}

/** "Online", "Offline, scanning against the door list", or the honest third case. */
export function describeMode(online: boolean, setReady: boolean): string {
  if (online) return 'Online'
  return setReady ? 'Offline, scanning against the door list' : 'Offline, and no door list on this phone'
}

export function describePending(n: number): string {
  return n === 0 ? '' : `${pluralScans(n)} waiting to sync`
}

export function describeSyncSummary(s: SyncSummary): string {
  if (s.synced === 0) return ''
  const base = `${pluralScans(s.synced)} synced`
  if (s.needsReview === 0) return `${base}.`
  return `${base}, ${s.needsReview} need${s.needsReview === 1 ? 's' : ''} review.`
}

/**
 * Why a synced scan was flagged, in the words the door can pass on. Every
 * flag means the same thing: this phone let someone in on a ticket the server
 * could not admit at sync time.
 */
export function describeFlag(outcome: Pick<SyncOutcome, 'result' | 'holderName'>, ticketCode: string): string {
  const who = outcome.holderName ? ` (${outcome.holderName})` : ''
  switch (outcome.result) {
    case 'already_scanned':
      return `${ticketCode}${who} was admitted at another door first. The organiser can review it under Attendees.`
    case 'refunded':
      return `${ticketCode}${who} had been refunded before this phone admitted it. The organiser can review it under Attendees.`
    case 'not_found':
      return `${ticketCode}${who} no longer matches a ticket on this event. The organiser can review it under Attendees.`
    default:
      return `${ticketCode}${who} could not be admitted on the server (${outcome.result.replace(/_/g, ' ')}). The organiser can review it under Attendees.`
  }
}

/** The result card's words for any outcome, device or server, with "how long ago" read against `now`. */
export function describeDoorOutcome(outcome: DoorOutcome, now: number = Date.now()): ScanResultView {
  if (outcome.result === 'stale_set') {
    return { decision: 'reject', label: 'REJECT', reason: `${STALE_SET_REASON}. Reconnect to refresh it.` }
  }
  if (outcome.result === 'already_scanned') {
    const ago = describeHowLongAgo(outcome.firstScannedAt, now)
    return { decision: 'reject', label: 'REJECT', reason: ago ? `Already used ${ago}` : 'Already used' }
  }
  return describeScanResult(outcome.result, outcome.firstScannedAt)
}
