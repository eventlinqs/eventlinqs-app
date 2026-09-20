import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { canManageOrganisationSeating } from '@/lib/organisations/access'
import { SeatsManagementClient } from './seats-client'
import { SyncChartButton } from './sync-chart-button'

type Props = {
  params: Promise<{ id: string }>
}

/** The columns this screen reads, named so the pager's generic is not implicit. */
type SeatRow = {
  id: string
  row_label: string
  seat_number: string
  seat_type: string
  status: string
  held_reason: string | null
  seat_map_section_id: string | null
  x: number | null
  y: number | null
}
type SectionRow = { id: string; name: string; color: string }
type UnassignedTicketRow = {
  id: string
  ticket_code: string
  holder_name: string | null
  holder_email: string | null
  order_item: { item_name?: string } | { item_name?: string }[] | null
}

export default async function SeatsManagementPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  // This used to fold `eventError` into notFound(), so a blink read as a missing
  // event; readOrThrow throws a real fault and answers null only for "no row".
  const event = await readOrThrow('dashboard event seats', () =>
    admin
      .from('events')
      .select('id, title, organisation_id, has_reserved_seating, seat_map_id, organiser_assigns_seats')
      .eq('id', eventId)
      .single(),
  )

  if (!event) notFound()

  // Owner OR owner/admin/manager member (the door-scan trust level).
  const allowed = await canManageOrganisationSeating(supabase, user.id, event.organisation_id)
  if (!allowed) notFound()

  if (!event.has_reserved_seating) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-ink-400">This event does not use reserved seating.</p>
        <Link
          href={`/dashboard/events/${eventId}/edit`}
          className="mt-4 inline-block text-sm text-gold-500 hover:underline"
        >
          Edit event to enable reserved seating
        </Link>
      </div>
    )
  }

  /*
   * THE THREE READS BEHIND THIS SCREEN, AND THE THREE DIFFERENT CEILINGS THEY
   * USED TO CARRY.
   *
   * SEATS had a pager of its own, and it was two faults rather than none. It
   * looped `for (let from = 0; from < 10000; from += PAGE)`, so a chart with
   * more than ten thousand seats lost the remainder with no error and nothing
   * on screen to show for it, and it stopped as soon as a page came back
   * SHORTER than the page size, which is only correct while the project's row
   * ceiling and the page size are equal. The ceiling is a dashboard setting
   * this repository cannot see; lower it to 500, ask for 1,000, and the first
   * page is "short" and the loop reports half a chart as the whole chart.
   * `readEveryRow` advances by what ARRIVED and stops only on an empty page,
   * which is correct at any ceiling, and it raises rather than truncating.
   *
   * THE UNASSIGNED HOLDERS were read with no bound at all. In
   * organiser-assigns mode this list IS the seating tool: every person on it
   * has paid and is waiting to be given a seat. Past a thousand of them the
   * organiser could not seat the rest, because the only screen that can do it
   * did not show them. It was also ordered on `created_at`, which is not
   * unique, so it was not a total order and paging it would have been
   * undefined. `id` is the tiebreak; the display order is unchanged.
   *
   * SECTIONS were unbounded too. Small in practice, bounded here anyway,
   * because "small in practice" is how the other two started.
   *
   * A FAILURE THROWS. This file already uses readOrThrow above for exactly
   * this reason: an empty seat map that means "the database blinked" looks
   * identical to one that means "this event has no seats", and the organiser
   * would act on the second while looking at the first.
   */
  const [seats, sections, unassigned] = await Promise.all([
    readEveryRow<SeatRow>('event seats', (from, to) =>
      supabase
        .from('seats')
        .select('id, row_label, seat_number, seat_type, status, held_reason, seat_map_section_id, x, y')
        .eq('event_id', eventId)
        // A total order: row then seat for the chart, `id` last so no seat can
        // fall between two windows or arrive in both.
        .order('row_label')
        .order('seat_number')
        .order('id')
        .range(from, to),
    ),
    event.seat_map_id
      ? readEveryRow<SectionRow>('event seat map sections', (from, to) =>
          supabase
            .from('seat_map_sections')
            .select('id, name, color')
            .eq('seat_map_id', event.seat_map_id!)
            .order('sort_order')
            .order('id')
            .range(from, to),
        )
      : Promise.resolve([] as SectionRow[]),
    // Organiser-assigns mode: paid tickets awaiting a seat. Admin client so
    // the organiser sees every holder regardless of buyer-scoped RLS.
    event.organiser_assigns_seats
      ? readEveryRow<UnassignedTicketRow>('event unassigned ticket holders', (from, to) =>
          admin
            .from('tickets')
            .select('id, ticket_code, holder_name, holder_email, order_item:order_items(item_name)')
            .eq('event_id', eventId)
            .eq('status', 'valid')
            .is('seat_id', null)
            .order('created_at')
            .order('id')
            .range(from, to),
        )
      : Promise.resolve([] as UnassignedTicketRow[]),
  ])

  return (
    <div>
      <div className="mb-6 border-b border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
            ← Events
          </Link>
          <Link
            href={`/dashboard/events/${eventId}/edit`}
            className="text-sm text-ink-400 hover:text-ink-600"
          >
            {event.title}
          </Link>
          <span className="text-sm font-medium text-ink-900">Seat Management</span>
          {event.seat_map_id && (
            <span className="ml-auto">
              <SyncChartButton eventId={eventId} />
            </span>
          )}
        </div>
      </div>

      <SeatsManagementClient
        eventId={eventId}
        seats={seats}
        sections={sections}
        unassignedTickets={unassigned.map(t => ({
          id: t.id,
          ticket_code: t.ticket_code,
          holder_name: t.holder_name,
          holder_email: t.holder_email,
          item_name: (t.order_item as { item_name?: string } | null)?.item_name ?? 'Admission',
        }))}
      />
    </div>
  )
}
