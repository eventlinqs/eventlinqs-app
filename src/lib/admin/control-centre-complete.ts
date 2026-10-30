import type { CampaignLevel } from '@/lib/campaigns/eligibility'
import type { DashboardFigure } from './founder-dashboard-math'

/**
 * The founder control centre's last two rows (Lawal's DemandOS directive of 30 October 2026, section 11: "campaign-ready
 * events" and "media approvals"), kept on their own import line so the dashboard stacks beside the other heads. Pure:
 * founder-dashboard.ts reads, this decides what each row says. What could not be read is not counted, never 0.
 */

type CountRead = { readonly value: number | null; readonly note?: string }

/** The venue photographs a person must decide on in /admin/venues/photos: put forward (pending) or challenged by an organiser. */
export function venuePhotoFigure(r: CountRead): DashboardFigure {
  return {
    label: 'Venue photos waiting for a decision',
    value: r.value,
    asksForAPerson: true,
    href: '/admin/venues/photos',
    kind: 'approve',
    cadence: 'daily',
    ...(r.note ? { note: r.note } : {}),
  }
}

type Reading =
  | { ok: true; value: { readonly events: readonly { readonly level: CampaignLevel | null }[]; readonly venuePhotosUnread: boolean } }
  | { ok: false; note: string }

/** The upcoming public nights D1's rules find ready for a Featured or Performance campaign. Discovery is every night's floor, so it is not counted here. */
export function campaignReadyFigure(r: Reading): DashboardFigure {
  const base = { label: 'Nights ready for a campaign', asksForAPerson: false, href: '/admin/eligibility', kind: 'measure', cadence: 'weekly' } as const
  if (!r.ok) return { ...base, value: null, note: r.note }
  const performance = r.value.events.filter((e) => e.level === 'performance').length
  const featured = r.value.events.filter((e) => e.level === 'featured').length
  const of = r.value.events.length
  const note = `Performance ${performance}, Featured ${featured}, of ${of} upcoming public ${of === 1 ? 'night' : 'nights'}; nothing is spent without Lawal`
  return {
    ...base,
    value: performance + featured,
    note: r.value.venuePhotosUnread ? `${note}; venue photographs could not be read, so none counted` : note,
  }
}
