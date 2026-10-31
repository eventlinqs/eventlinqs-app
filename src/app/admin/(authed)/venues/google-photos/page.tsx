import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookAtVenue, venueRows, type VenueRow } from '@/lib/places/venue-google-admin'
import { approveVenueGoogleAction, findVenueOnGoogleAction, refuseVenueGoogleAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Google venue photos | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * GOOGLE VENUE PHOTOS, A PERSON DECIDES (directive of 31 October, 5.44 pm, sections 5 and 6). Find asks Google which place
 * is this venue (name, address and location must all agree); Look shows its current lead photo with the credit Google
 * requires; Approve lets its event pages show Google photos; Refuse keeps the reason. Every Google call is through the
 * cost guard. Google's photos are never stored: each look is a fresh, billed call, so it happens only on a press.
 * Lawal's ruling of 30 October 23:56: event detail pages only, never list cards.
 */

const CONTROL = 'inline-flex min-h-[44px] items-center'

const NOTICES: Record<string, string> = {
  matched: 'Matched on name, address and location. Look at its photo before approving.',
  'no match': 'No Google place agreed on name, address and location. Nothing kept.',
  stopped: 'Stopped by the cost guard. Nothing was spent beyond it.',
  approved: 'Approved. Its event pages may now show its Google photo, credited.',
  refused: 'Refused, with the reason kept.',
  invalid: 'That form was not complete. Nothing changed.',
}

function state(v: VenueRow): string {
  if (v.refusedReason) return `Refused: ${v.refusedReason}`
  if (v.approvedAt) return 'Approved'
  if (v.placeId) return `Matched, waiting for a look (${v.evidence?.name ?? ''}${typeof v.evidence?.metres === 'number' ? `, ${v.evidence.metres} m` : ''})`
  return 'Not matched'
}

export default async function GoogleVenuePhotosPage({ searchParams }: { searchParams: Promise<{ status?: string; why?: string; look?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.venues.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.venues.google_photos.view', session })
  const sp = await searchParams
  const db = createAdminClient()
  const rows = await venueRows(db)
  const lookId = typeof sp.look === 'string' && /^[0-9a-f-]{36}$/i.test(sp.look) ? sp.look : null
  const look = lookId ? await lookAtVenue(db, lookId) : null

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 text-white sm:px-6">
      <h1 className="font-display text-2xl font-semibold">Google venue photos</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/60">
        A venue&apos;s Google photos show on its event pages only after you look and approve. Each look asks Google afresh and counts against the day&apos;s Google quota.
      </p>
      {sp.status && NOTICES[sp.status] ? (
        <p role="status" className="mt-4 rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm">
          {NOTICES[sp.status]}
          {sp.why ? <span className="block text-xs text-white/60">{sp.why}</span> : null}
        </p>
      ) : null}
      <ul className="mt-6 space-y-3">
        {rows.map((v) => (
          <li key={v.id} data-venue={v.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">{v.name}</h2>
            <p className="text-xs text-white/60">
              {v.address ?? 'No address held'} &middot; {v.upcoming} upcoming {v.upcoming === 1 ? 'night' : 'nights'}
            </p>
            <p className="mt-1 text-sm text-white/80">{state(v)}</p>
            {lookId === v.id && look ? (
              look.ok ? (
                <figure className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a staff look at a Google photo; next/image would cache it in our optimiser, which Google's terms forbid */}
                  <img src={look.photo.uri} alt={`Google's current lead photo for ${v.name}`} className="h-56 w-full rounded-lg object-cover md:w-96" />
                  <figcaption className="mt-1 text-xs text-white/60">
                    Photo:{' '}
                    {look.photo.authors.map((a, i) => (
                      <span key={a.displayName + i}>
                        {i > 0 && <>, </>}
                        {a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{a.displayName}</a> : a.displayName}
                      </span>
                    ))}{' '}
                    via Google Maps
                  </figcaption>
                </figure>
              ) : (
                <p className="mt-2 text-xs text-amber-200">{look.reason}</p>
              )
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={findVenueOnGoogleAction}>
                <input type="hidden" name="id" value={v.id} />
                <button className={`${CONTROL} rounded-md border border-white/15 bg-white/[0.06] px-3 text-xs`}>{v.placeId ? 'Find again' : 'Find on Google'}</button>
              </form>
              {v.placeId ? (
                <a href={`/admin/venues/google-photos?look=${v.id}`} className={`${CONTROL} rounded-md border border-white/15 px-3 text-xs underline-offset-2 hover:underline`}>
                  Look at its photo
                </a>
              ) : null}
              {v.placeId && !v.approvedAt ? (
                <form action={approveVenueGoogleAction}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className={`${CONTROL} rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs text-emerald-100`}>Approve</button>
                </form>
              ) : null}
              {v.placeId ? (
                <form action={refuseVenueGoogleAction} className="flex gap-2">
                  <input type="hidden" name="id" value={v.id} />
                  <label className="sr-only" htmlFor={`r-${v.id}`}>Why it is refused</label>
                  <input id={`r-${v.id}`} name="reason" required minLength={3} maxLength={300} placeholder="Why it is refused" className="min-h-[44px] rounded-md border border-white/15 bg-[#131A2A] px-2 text-xs text-white" />
                  <button className={`${CONTROL} rounded-md border border-white/15 bg-white/[0.06] px-3 text-xs`}>Refuse</button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
