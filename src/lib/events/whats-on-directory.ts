/**
 * WHAT'S ON, A DAY GROUPED DIRECTORY (Lawal's order of 1 November 2026, 11:01, the 'layers' sample he saw:
 * C:\dev\EVIDENCE\CARD-DESIGNS-31OCT\layers.js). Every night is one row under the day it happens, in its OWN zone:
 * category, title, venue, city, the price line every card says, and the time.
 *
 * Geelong and Melbourne lead each day (plan v4's focus market, C:\dev\GROWTH\plan.json); within each part the nights
 * keep their time order. The price comes from the one function every card and broadcast asks
 * (src/lib/broadcast/price-line.ts), so a night sold elsewhere is never called Free here either.
 */
import { broadcastCta, broadcastPriceLabel } from '@/lib/broadcast/price-line'
import { sellerName } from '@/lib/events/booking-links'
import { PLATFORM_TIME_ZONE, resolveZone } from '@/lib/dates/event-time'

export type DirectoryInput = {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly start_date: string
  readonly timezone: string | null
  readonly venue_name: string | null
  readonly venue_city: string | null
  /** The venue's street address, from which a row reads its suburb ('..., Belmont VIC 3216'). */
  readonly venue_address?: string | null
  readonly venue_latitude?: number | null
  readonly venue_longitude?: number | null
  readonly category: { readonly name: string; readonly slug: string } | null
  readonly is_free?: boolean | null
  readonly entry_mode?: string | null
  readonly external_ticket_url?: string | null
  readonly ticket_tiers: readonly { readonly price: number; readonly currency: string }[] | null
}

export type DirectoryRow = {
  readonly id: string
  readonly href: string
  readonly title: string
  readonly venue: string | null
  readonly city: string | null
  readonly category: string | null
  readonly categorySlug: string | null
  readonly price: string
  /** The start time in the event's own zone, or null where no time is held (a start of exactly 00:00). */
  readonly time: string | null
  readonly free: boolean
  /** Where the night is booked, in words: 'Tickets on EventLinqs', 'Tickets on Ticketek', 'Walk in, no ticket needed'. */
  readonly source: string
  readonly format: 'walk_in' | 'ticketed' | 'other'
  readonly cityKey: string
  readonly dayKey: string
  readonly dayLabel: string
  readonly ts: number
  /** A small image only where an authorised one exists (a credited venue photo or a rights recorded cover). */
  readonly thumb: string | null
  /** The suburb, read from the venue's address ('..., Belmont VIC 3216' is Belmont), else the venue's city. */
  readonly suburb: string | null
  /** The venue's point where held, for the city guide's deliberate widening by distance. */
  readonly lat: number | null
  readonly lng: number | null
}

export type DirectoryDay = {
  readonly key: string
  readonly label: string
  readonly tag: 'Today' | 'Tomorrow' | null
  readonly rows: readonly DirectoryRow[]
}

/** Plan v4's focus market: Geelong and Melbourne, an hour apart, first in every list it orders. */
const FOCUS_CITIES = new Set(['geelong', 'melbourne'])

export function dayKey(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function dayLabel(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' })
    .format(at)
    .replace(/,/g, '')
}

function timeLabel(at: Date, zone: string): string | null {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
  // No time is held for a night stored at midnight: say nothing rather than '12:00 am'.
  if (hm === '00:00' || hm === '24:00') return null
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(at)
    .replace(/\u202f/g, ' ')
    .toLowerCase()
}

/**
 * WHERE A NIGHT IS BOOKED, ONE PATTERN IN EVERY EVENT ROW (Lawal, 2 November 2026, 09:00, refinement 1): our checkout is
 * 'Book on EventLinqs'; another site is 'Tickets at <seller>' or 'Register at <seller>', the seller named as it names
 * itself (sellerName, src/lib/events/booking-links.ts), never its domain; a site with no name here is 'Get tickets' or
 * 'Register'; a free walk-in night is 'Free \u00b7 Walk in'. The full address stays on the event page.
 */
export const WALK_IN_LABEL = 'Free \u00b7 Walk in'
export const OUR_CHECKOUT_LABEL = 'Book on EventLinqs'
/** A label that sends the visitor to another site (it carries the outbound mark). */
export const OUTBOUND_LABEL = /^(Tickets at |Register at )|^(Get tickets|Register)$/

export function sourceLabel(e: Pick<DirectoryInput, 'ticket_tiers' | 'external_ticket_url' | 'is_free' | 'entry_mode'>): string {
  const cta = broadcastCta({
    ticket_tiers: e.ticket_tiers ?? [],
    external_ticket_url: e.external_ticket_url ?? null,
    is_free: e.is_free ?? null,
    entry_mode: e.entry_mode ?? null,
  })
  const seller = sellerName(e.external_ticket_url ?? null)
  switch (cta.state) {
    case 'paid_native':
      return OUR_CHECKOUT_LABEL
    case 'paid_external':
      return seller ? `Tickets at ${seller}` : 'Get tickets'
    case 'free_registration':
      // Free, registered on our own checkout (no outside address): it never leaves EventLinqs, so no outbound label.
      if (!(e.external_ticket_url ?? '').trim()) return OUR_CHECKOUT_LABEL
      return seller ? `Register at ${seller}` : 'Register'
    case 'free_open':
      return WALK_IN_LABEL
    default:
      return 'Details from the venue'
  }
}

/**
 * The price a row may show: never a sentence about where it is sold ('Tickets on <site>' is the price line's words when
 * no price was checked; the row's booking label already says where), so a row never names a domain.
 */
export function rowPrice(priceLine: string): string {
  return /^Tickets (on |are sold elsewhere)/.test(priceLine) ? '' : priceLine
}

/**
 * The suburb of a venue, read from its own address: the last part that carries an Australian state ('Level 1, 231 Bourke
 * St, Melbourne VIC 3000' is Melbourne; '82 The Terrace, Ocean Grove VIC 3226' is Ocean Grove). Where the address names
 * no state, the venue's city stands; nothing is invented.
 */
export function suburbOf(address: string | null, city: string | null): string | null {
  const parts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const m = /^(.*?)\s+(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/i.exec(parts[i])
    if (m && m[1].trim()) return m[1].trim()
  }
  return city && city.trim() ? city.trim() : null
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function directoryDays(events: readonly DirectoryInput[], now: Date, thumbs: ReadonlyMap<string, string> = new Map()): DirectoryDay[] {
  const today = dayKey(now, PLATFORM_TIME_ZONE)
  const tomorrow = addDays(today, 1)
  const days = new Map<string, { label: string; rows: { row: DirectoryRow; at: number; focus: boolean }[] }>()

  for (const e of events) {
    const at = new Date(e.start_date)
    if (Number.isNaN(at.getTime())) continue
    const zone = resolveZone(e.timezone)
    const key = dayKey(at, zone)
    const price = rowPrice(broadcastPriceLabel({
      ticket_tiers: e.ticket_tiers ?? [],
      external_ticket_url: e.external_ticket_url ?? null,
      is_free: e.is_free ?? null,
      entry_mode: e.entry_mode ?? null,
    }))
    const row: DirectoryRow = {
      id: e.id,
      href: `/events/${e.slug}`,
      title: e.title,
      venue: e.venue_name,
      city: e.venue_city,
      category: e.category?.name ?? null,
      categorySlug: e.category?.slug ?? null,
      price,
      time: timeLabel(at, zone),
      free: /^free/i.test(price),
      source: sourceLabel(e),
      format: e.entry_mode === 'walk_in' ? 'walk_in' : (e.ticket_tiers ?? []).length > 0 || (e.external_ticket_url ?? '').trim() ? 'ticketed' : 'other',
      cityKey: (e.venue_city ?? '').trim().toLowerCase(),
      suburb: suburbOf(e.venue_address ?? null, e.venue_city),
      dayKey: key,
      dayLabel: dayLabel(at, zone),
      ts: at.getTime(),
      thumb: thumbs.get(e.id) ?? null,
      lat: typeof e.venue_latitude === 'number' ? e.venue_latitude : null,
      lng: typeof e.venue_longitude === 'number' ? e.venue_longitude : null,
    }
    const day = days.get(key) ?? { label: dayLabel(at, zone), rows: [] }
    day.rows.push({ row, at: at.getTime(), focus: FOCUS_CITIES.has((e.venue_city ?? '').trim().toLowerCase()) })
    days.set(key, day)
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, d]) => ({
      key,
      label: d.label,
      tag: key === today ? ('Today' as const) : key === tomorrow ? ('Tomorrow' as const) : null,
      rows: d.rows
        .sort((a, b) => Number(b.focus) - Number(a.focus) || a.at - b.at)
        .map((r) => r.row),
    }))
}

/** The filter chips: Free first, then each category the directory holds, the most nights first. */
export function directoryChips(days: readonly DirectoryDay[]): { key: string; label: string }[] {
  return chipsOf(days.flatMap((d) => d.rows))
}

export function chipsOf(rows: readonly DirectoryRow[]): { key: string; label: string }[] {
  const counts = new Map<string, { label: string; n: number }>()
  for (const r of rows) {
    if (!r.categorySlug || !r.category) continue
    const c = counts.get(r.categorySlug) ?? { label: r.category, n: 0 }
    c.n += 1
    counts.set(r.categorySlug, c)
  }
  const chips = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label))
    .map(([key, c]) => ({ key, label: c.label }))
  return rows.some((r) => r.free) ? [{ key: 'free', label: 'Free' }, ...chips] : chips
}
