import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DiscountCodesClient } from './discounts-client'
import type { DiscountCode, TicketTier } from '@/types/database'
import { resolveEventAccess } from '@/lib/organisations/event-access'

type Props = {
  params: Promise<{ id: string }>
}

export default async function DiscountsPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    // timezone comes along so the discount window is read in the EVENT's zone.
    // Without it the form's "YYYY-MM-DDTHH:mm" was stored raw and Postgres read
    // it as UTC, so a code valid from 12:00 opened at 11pm the night before.
    .select('id, title, organisation_id, timezone')
    .eq('id', eventId)
    .single()

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

  const { data: discountCodes } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, currency')
    .eq('event_id', eventId)
    .eq('is_active', true)

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}/orders`} className="text-sm text-ink-400 hover:text-ink-600">
          ← Orders
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Discount Codes</h1>
        <span className="text-ink-400 text-sm">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      <DiscountCodesClient
        eventId={eventId}
        eventTimezone={event.timezone ?? null}
        currency={tiers?.[0]?.currency ?? 'AUD'}
        initialCodes={(discountCodes ?? []) as DiscountCode[]}
        tiers={(tiers ?? []) as Pick<TicketTier, 'id' | 'name'>[]}
      />
    </div>
  )
}
