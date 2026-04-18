import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'
import { SquadPayForm } from './squad-pay-form'

type Props = {
  params: Promise<{ token: string; member_id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  return {
    title: `Pay Your Share — Squad | EventLinqs`,
    robots: { index: false },
  }
}

export default async function SquadPayPage({ params }: Props) {
  const { token, member_id } = await params

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load member with squad context
  const { data: member, error } = await adminClient
    .from('squad_members')
    .select(`
      id, user_id, status, guest_email,
      attendee_first_name, attendee_last_name, attendee_email,
      squad:squads!squad_id (
        id, status, expires_at, share_token, total_spots,
        ticket_tier:ticket_tiers!ticket_tier_id ( id, name, price, currency ),
        event:events!event_id ( id, title, slug, start_date, timezone, venue_name, venue_city )
      )
    `)
    .eq('id', member_id)
    .single()

  if (error || !member) notFound()

  const squad = (member.squad as unknown) as {
    id: string
    status: string
    expires_at: string
    share_token: string
    total_spots: number
    ticket_tier: { id: string; name: string; price: number; currency: string }
    event: { id: string; title: string; slug: string; start_date: string; timezone: string; venue_name: string | null; venue_city: string | null }
  } | null

  if (!squad) notFound()

  // Verify the token matches (security check)
  if (squad.share_token !== token) notFound()

  // Auth check: only the member themselves can pay
  if (member.user_id && member.user_id !== user?.id) {
    redirect(`/login?next=/squad/${token}/pay/${member_id}`)
  }

  // Guard: already paid
  if (member.status === 'paid') {
    redirect(`/squad/${token}`)
  }

  // Guard: squad no longer active
  if (squad.status !== 'forming' || new Date(squad.expires_at) < new Date()) {
    redirect(`/squad/${token}`)
  }

  const tier = squad.ticket_tier
  const event = squad.event

  const eventDate = new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })

  const memberName = [member.attendee_first_name, member.attendee_last_name].filter(Boolean).join(' ')
  const memberEmail = member.attendee_email ?? member.guest_email ?? ''

  return (
    <div className="min-h-screen bg-ink-100">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <a href="/" className="text-lg font-bold text-gold-500">EVENTLINQS</a>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        {/* Order summary */}
        <div className="rounded-2xl border border-ink-200 bg-white p-5 mb-6 shadow-sm">
          <h1 className="text-lg font-bold text-ink-900 mb-1">Pay your share</h1>
          <p className="text-sm text-ink-400 mb-4">
            You&apos;re paying for 1 spot in a squad for this event.
          </p>

          <div className="border-t border-ink-100 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-600">{event.title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-400">{eventDate}</span>
            </div>
            {(event.venue_name || event.venue_city) && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-400">
                  {[event.venue_name, event.venue_city].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-ink-100">
              <span className="text-ink-600">1 × {tier.name}</span>
              <span className="font-medium text-ink-900">
                {tier.currency.toUpperCase()} {(tier.price / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Stripe payment form */}
        <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <SquadPayForm
            memberId={member_id}
            squadToken={token}
            memberName={memberName}
            memberEmail={memberEmail}
            pricePerSpotCents={tier.price}
            currency={tier.currency}
            publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
          />
        </div>
      </div>
    </div>
  )
}
