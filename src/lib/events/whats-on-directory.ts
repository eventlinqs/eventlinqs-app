/**
 * WHAT'S ON, A DAY GROUPED DIRECTORY (Lawal's order of 1 November 2026, 11:01, the 'layers' sample he saw:
 * C:\dev\EVIDENCE\CARD-DESIGNS-31OCT\layers.js). Every night is one row under the day it happens, in its OWN zone:
 * category, title, venue, city, the price line every card says, and the time.
 *
 * Geelong and Melbourne lead each day (plan v4's focus market, C:\dev\GROWTH\plan.json); within each part the nights
 * keep their time order. The price comes from the one function every card and broadcast asks
 * (src/lib/broadcast/price-line.ts), so a night sold elsewhere is never called Free here either.
 */
import { broadcastPriceLabel } from '@/lib/broadcast/price-line'
import { PLATFORM_TIME_ZONE, resolveZone } from '@/lib/dates/event-time'

export type DirectoryInput = {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly start_date: string
  readonly timezone: string | null
  readonly venue_name: string | null
  readonly venue_city: string | null
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
  readonly time: string
  readonly free: boolean
}

export type DirectoryDay = {
  readonly key: string
  readonly label: string
  readonly tag: 'Today' | 'Tomorrow' | null
  readonly rows: readonly DirectoryRow[]
}

/** Plan v4: one weekend market, an hour apart, first in every list it orders. */
const FOCUS_CITIES = new Set(['geelong', 'melbourne'])

function dayKey(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function dayLabel(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' })
    .format(at)
    .replace(/,/g, '')
}

function timeLabel(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(at)
    .replace(/\u202f/g, ' ')
    .toLowerCase()
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function directoryDays(events: readonly DirectoryInput[], now: Date): DirectoryDay[] {
  const today = dayKey(now, PLATFORM_TIME_ZONE)
  const tomorrow = addDays(today, 1)
  const days = new Map<string, { label: string; rows: { row: DirectoryRow; at: number; focus: boolean }[] }>()

  for (const e of events) {
    const at = new Date(e.start_date)
    if (Number.isNaN(at.getTime())) continue
    const zone = resolveZone(e.timezone)
    const key = dayKey(at, zone)
    const price = broadcastPriceLabel({
      ticket_tiers: e.ticket_tiers ?? [],
      external_ticket_url: e.external_ticket_url ?? null,
      is_free: e.is_free ?? null,
      entry_mode: e.entry_mode ?? null,
    })
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
  const rows = days.flatMap((d) => d.rows)
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
