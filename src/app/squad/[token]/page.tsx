import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSquadByToken } from '@/app/actions/squads'
import { SquadJoinPanel } from '@/components/squads/squad-join-panel'

type Props = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const squad = await getSquadByToken(token)

  if (!squad) {
    return { title: 'Squad Not Found — EventLinqs' }
  }

  return {
    title: `Join the Squad — ${squad.event.title} — EventLinqs`,
    description: `${squad.squad_members.filter(m => m.status === 'paid').length} of ${squad.total_spots} spots filled. Join the squad for ${squad.event.title}.`,
  }
}

function formatDateTime(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  })
}

export default async function SquadPage({ params }: Props) {
  const { token } = await params
  const squad = await getSquadByToken(token)

  if (!squad) notFound()

  // Get current user for auth-state-aware join panel
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const activeMembers = squad.squad_members.filter(m => m.status === 'invited' || m.status === 'paid')
  const paidMembers = squad.squad_members.filter(m => m.status === 'paid')
  const filledSpots = activeMembers.length
  const paidSpots = paidMembers.length
  const remainingSpots = squad.total_spots - filledSpots

  const isExpired = new Date(squad.expires_at) < new Date()
  const isFull = filledSpots >= squad.total_spots
  const isComplete = squad.status === 'completed'
  const isCancelled = squad.status === 'cancelled'
  const isExpiredStatus = squad.status === 'expired' || isExpired

  // Countdown: seconds until expiry
  const msUntilExpiry = new Date(squad.expires_at).getTime() - Date.now()
  const hoursLeft = Math.max(0, Math.floor(msUntilExpiry / (1000 * 60 * 60)))
  const minutesLeft = Math.max(0, Math.floor((msUntilExpiry % (1000 * 60 * 60)) / (1000 * 60)))

  // Is current user already a member?
  const currentUserMember = user
    ? squad.squad_members.find(m => m.user_id === user.id)
    : null

  const pricePerSpot = squad.ticket_tier.price

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-blue-600">EVENTLINQS</Link>
          {!user && (
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Event hero */}
        {squad.event.cover_image_url && (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 bg-gray-200">
            <Image
              src={squad.event.cover_image_url}
              alt={squad.event.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Event info */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{squad.event.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateTime(squad.event.start_date, squad.event.timezone)}
          </p>
          {squad.event.venue_name && (
            <p className="text-sm text-gray-500">
              {squad.event.venue_name}{squad.event.venue_city ? `, ${squad.event.venue_city}` : ''}
            </p>
          )}
        </div>

        {/* Squad card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-6">
          {/* Squad header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">Squad for</p>
                <p className="font-semibold text-gray-900">{squad.ticket_tier.name}</p>
              </div>
              {isComplete ? (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Complete
                </span>
              ) : isCancelled ? (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                  Cancelled
                </span>
              ) : isExpiredStatus ? (
                <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                  Expired
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  Forming
                </span>
              )}
            </div>
          </div>

          {/* Spots progress */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">
                <span className="text-lg font-bold text-gray-900">{filledSpots}</span>
                {' '}of{' '}
                <span className="text-lg font-bold text-gray-900">{squad.total_spots}</span>
                {' '}spots filled
              </p>
              {paidSpots > 0 && (
                <p className="text-xs text-gray-500">{paidSpots} paid</p>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2.5" role="progressbar" aria-valuenow={filledSpots} aria-valuemin={0} aria-valuemax={squad.total_spots}>
              <div
                className="bg-[#4A90D9] h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, (filledSpots / squad.total_spots) * 100)}%` }}
              />
            </div>

            {/* Member dots */}
            <div className="mt-3 flex gap-2 flex-wrap" aria-label="Squad members">
              {Array.from({ length: squad.total_spots }).map((_, i) => {
                const member = activeMembers[i]
                const isPaid = member?.status === 'paid'
                const isInvited = member?.status === 'invited'
                return (
                  <div
                    key={i}
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                      isPaid
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : isInvited
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-gray-100 border-dashed border-gray-300 text-gray-400'
                    }`}
                    aria-label={
                      isPaid
                        ? `Spot ${i + 1}: Paid`
                        : isInvited
                        ? `Spot ${i + 1}: Invited`
                        : `Spot ${i + 1}: Open`
                    }
                  >
                    {isPaid ? '✓' : isInvited ? '…' : '+'}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Price + expiry */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Price per person</p>
                <p className="text-lg font-bold text-gray-900">
                  {squad.ticket_tier.currency.toUpperCase()} {(pricePerSpot / 100).toFixed(2)}
                </p>
              </div>
              {!isExpiredStatus && !isComplete && !isCancelled && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Expires in</p>
                  <p className="text-sm font-semibold text-amber-700">
                    {hoursLeft > 0 ? `${hoursLeft}h ` : ''}{minutesLeft}m
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Join panel — client component for interactivity */}
        <SquadJoinPanel
          squadId={squad.id}
          shareToken={token}
          eventSlug={squad.event.slug}
          status={squad.status}
          isExpired={isExpiredStatus}
          isFull={isFull}
          remainingSpots={remainingSpots}
          currentUserMemberId={currentUserMember?.id ?? null}
          currentUserMemberStatus={currentUserMember?.status ?? null}
          isLoggedIn={!!user}
          pricePerSpotCents={pricePerSpot}
          currency={squad.ticket_tier.currency}
          eventTitle={squad.event.title}
        />
      </div>

      {/* Bottom spacer for mobile fixed CTA */}
      <div className="pb-28 md:pb-0" aria-hidden="true" />
    </div>
  )
}
