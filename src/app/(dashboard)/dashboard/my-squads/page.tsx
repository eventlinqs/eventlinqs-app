import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMySquads } from '@/app/actions/squads'
import type { SquadStatus } from '@/types/database'
import { CopyLinkButton } from './copy-link-button'

function formatDate(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

function statusBadge(status: SquadStatus) {
  switch (status) {
    case 'forming':
      return <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Forming</span>
    case 'completed':
      return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Completed</span>
    case 'expired':
      return <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">Expired</span>
    case 'cancelled':
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">Cancelled</span>
  }
}

function timeRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

export default async function MySquadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const squads = await getMySquads()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Squads</h1>
        <Link
          href="/events"
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          Browse Events →
        </Link>
      </div>

      {squads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">You don&apos;t have any squads yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Start a squad from any event page to go with friends — everyone pays their own share.
          </p>
          <Link
            href="/events"
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Browse Events
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {squads.map(squad => {
            const activeMembers = squad.squad_members.filter(m => m.status === 'invited' || m.status === 'paid')
            const paidMembers = squad.squad_members.filter(m => m.status === 'paid')
            const isLeader = squad.leader_user_id === user.id
            const filledSpots = activeMembers.length
            const paidSpots = paidMembers.length

            return (
              <div
                key={squad.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                {/* Header row */}
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900 truncate">
                        {squad.event.title}
                      </h2>
                      {statusBadge(squad.status)}
                      {isLeader && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Leader
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {formatDate(squad.event.start_date, squad.event.timezone)}
                    </p>
                    {(squad.event.venue_name || squad.event.venue_city) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[squad.event.venue_name, squad.event.venue_city].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-500">{squad.ticket_tier.name}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {squad.ticket_tier.currency.toUpperCase()} {(squad.ticket_tier.price / 100).toFixed(2)}/ea
                    </p>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-700">
                      <span className="font-semibold text-gray-900">{filledSpots}</span>
                      {' '}/ {squad.total_spots} spots filled
                      {paidSpots > 0 && paidSpots < filledSpots && (
                        <span className="text-gray-500"> ({paidSpots} paid)</span>
                      )}
                    </span>
                    {squad.status === 'forming' && (
                      <span className="text-xs text-amber-700">
                        {timeRemaining(squad.expires_at)}
                      </span>
                    )}
                  </div>
                  <div
                    className="w-full bg-gray-100 rounded-full h-2"
                    role="progressbar"
                    aria-valuenow={filledSpots}
                    aria-valuemin={0}
                    aria-valuemax={squad.total_spots}
                  >
                    <div
                      className={`h-2 rounded-full transition-all ${squad.status === 'completed' ? 'bg-emerald-500' : 'bg-[#4A90D9]'}`}
                      style={{ width: `${Math.min(100, (filledSpots / squad.total_spots) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  {squad.status === 'forming' && (
                    <Link
                      href={`/squad/${squad.share_token}`}
                      className="rounded-lg bg-[#4A90D9] px-4 py-2 text-sm font-medium text-white hover:bg-[#3478C5] transition-colors"
                    >
                      View Squad
                    </Link>
                  )}

                  {squad.status === 'forming' && (
                    <CopyLinkButton shareUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'}/squad/${squad.share_token}`} />
                  )}

                  {squad.status === 'completed' && (
                    <Link
                      href={`/squad/${squad.share_token}`}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      View
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
