import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { buildVenueReport, nightsAVenueSees, type VenueNightRow, type VenueReport } from './venue-report-math'

/**
 * The rows behind a venue's own report (the rules and why are in ./venue-report-math.ts). Read with the admin client
 * after the page's access gate has resolved the venue's organisation, as the seat map screen does. Every figure comes
 * from the kept night reports (organiser_night_reports), never recounted. A failed read throws: the error boundary
 * says so, rather than a venue reading a report that quietly lost its nights.
 */

const IDS_PER_READ = 200

export async function readVenueReport(venueId: string, organisationId: string): Promise<VenueReport> {
  const admin = createAdminClient()
  const [events, joined] = await Promise.all([
    readEveryRow<{ id: string; title: string; start_date: string; timezone: string; organisation_id: string }>('the nights at this venue', (from, to) =>
      admin.from('events').select('id, title, start_date, timezone, organisation_id').eq('venue_id', venueId).order('id', { ascending: true }).range(from, to),
    ),
    readEveryRow<{ id: string; event_id: string }>('the nights this venue joined', (from, to) =>
      admin.from('event_collaborators').select('id, event_id').eq('venue_id', venueId).eq('organisation_id', organisationId).eq('status', 'joined').order('id', { ascending: true }).range(from, to),
    ),
  ])
  const seen = nightsAVenueSees(events, organisationId, new Set(joined.map((j) => j.event_id)))

  const kept = new Map<string, unknown>()
  for (let i = 0; i < seen.length; i += IDS_PER_READ) {
    const ids = seen.slice(i, i + IDS_PER_READ).map((e) => e.id)
    const rows = await readEveryRow<{ id: string; event_id: string; figures: unknown }>('the night reports of this venue', (from, to) =>
      admin.from('organiser_night_reports').select('id, event_id, figures').in('event_id', ids).order('id', { ascending: true }).range(from, to),
    )
    for (const r of rows) kept.set(r.event_id, r.figures)
  }

  const rows: VenueNightRow[] = seen
    .filter((e) => kept.has(e.id))
    .map((e) => ({ eventId: e.id, title: e.title, startDate: e.start_date, timezone: e.timezone, own: e.own, figures: kept.get(e.id) }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  return buildVenueReport(rows)
}
