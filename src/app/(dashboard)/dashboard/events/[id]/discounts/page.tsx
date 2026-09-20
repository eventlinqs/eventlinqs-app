import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { DiscountCodesClient } from './discounts-client'
import type { DiscountCode, TicketTier } from '@/types/database'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import {
  discountFormCurrency,
  readEventDiscountCodes,
  readEventTicketTiers,
  type DiscountTierRow,
} from '@/lib/organisers/event-tier-config'

type Props = {
  params: Promise<{ id: string }>
}

export default async function DiscountsPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Through readOrThrow: a failed read answers 500, never a false 404.
  const event = await readOrThrow('dashboard event discounts', () =>
    supabase
      .from('events')
      // timezone comes along so the discount window is read in the EVENT's zone.
      // Without it the form's "YYYY-MM-DDTHH:mm" was stored raw and Postgres read
      // it as UTC, so a code valid from 12:00 opened at 11pm the night before.
      .select('id, title, organisation_id, timezone')
      .eq('id', eventId)
      .single(),
  )

  if (!event) notFound()

  /*
   * ACCESS, VIA THE SHARED GATE. Two defects in one line.
   *
   * PRIVILEGE: this filtered `.eq('owner_id', user.id)` on the SESSION client, and
   * the column lockdown does not grant `authenticated` owner_id. PostgreSQL needs
   * SELECT privilege on WHERE-clause columns, so the query was refused 42501, the
   * row came back null, and the page 404'd. That is the failure that forced the
   * emergency GRANT still on production.
   *
   * AUTHORISATION: it admitted the OWNER only. resolveEventAccess admits owner or
   * a member holding owner/admin/manager, matching updateEvent and
   * resolveRefundScope, so a venue's manager can reach the discount codes for an event they run.
   */
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) notFound()

  /*
   * BOTH READS FAIL LOUDLY, AND THE TIER READ IS ORDERED.
   *
   * Both used to be `const { data: x } = await ...`, so a refused read became
   * an empty list two lines later. The consequences were different and both
   * were bad: an empty CODE list tells an organiser their running promotion
   * does not exist, and the obvious response is to create it again, which the
   * unique constraint then refuses with a message about a code they cannot
   * see. An empty TIER list draws a form whose "applies to" list is blank on a
   * screen where that choice is the whole point.
   *
   * The tier read also carried no `.order()` at all, and `tiers[0].currency`
   * labels every money field on the form, so which currency the organiser was
   * typing into was decided by whichever row Postgres returned first and was
   * free to change between two loads.
   */
  const discountCodes = await readEventDiscountCodes<DiscountCode>(supabase, eventId)
  const tiers = await readEventTicketTiers<DiscountTierRow>(
    supabase,
    eventId,
    'id, name, currency',
    { activeOnly: true },
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/events/${eventId}/orders`} className="text-sm text-ink-400 hover:text-ink-600">
          ← Orders
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Discount Codes</h1>
        {/*
          HIDDEN UNTIL THE TITLE FITS BESIDE IT, inherited verbatim from the
          orders list header, which met this first: the row wraps, so at 390
          the event title goes to a second line and a separator left behind on
          the first is a heading that ends in a floating middot with nothing
          after it. A separator only separates while both things are on one
          line. This page had neither half of that fix.
        */}
        <span className="hidden text-ink-400 text-sm sm:inline">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      <DiscountCodesClient
        eventId={eventId}
        eventTimezone={event.timezone ?? null}
        currency={discountFormCurrency(tiers)}
        initialCodes={discountCodes}
        tiers={tiers as Pick<TicketTier, 'id' | 'name'>[]}
      />
    </div>
  )
}
