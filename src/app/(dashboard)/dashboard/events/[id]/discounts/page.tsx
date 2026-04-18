import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DiscountCodesClient } from './discounts-client'
import type { DiscountCode, TicketTier } from '@/types/database'

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
    .select('id, title, organisation_id')
    .eq('id', eventId)
    .single()

  if (!event) notFound()

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

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
        currency={tiers?.[0]?.currency ?? 'AUD'}
        initialCodes={(discountCodes ?? []) as DiscountCode[]}
        tiers={(tiers ?? []) as Pick<TicketTier, 'id' | 'name'>[]}
      />
    </div>
  )
}
