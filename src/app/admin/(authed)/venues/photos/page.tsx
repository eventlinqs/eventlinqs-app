import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { venueMediaDeps } from '@/lib/venues/venue-images'
import { unmatchedCandidateCount, waitingVenuePhotos, type WaitingPhoto, type WaitingVenue } from '@/lib/venues/venue-photo-queue'
import { approveVenuePhotoAction, refuseVenuePhotoAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Venue photographs | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const CONTROL = 'inline-flex min-h-[44px] items-center'

const LICENCE_WORDS: Record<string, string> = {
  owner_permission: 'the venue said yes',
  cc0: 'CC0',
  public_domain: 'public domain',
  cc_by: 'CC BY',
  cc_by_sa: 'CC BY-SA',
  commissioned: 'commissioned',
  licensed: 'licensed',
  google_places_terms: 'Google Places terms',
}

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  approved: { tone: 'ok', text: 'Approved. It now shows on every night at that venue.' },
  'photo-refused': { tone: 'ok', text: 'Refused, with the reason kept. It never shows.' },
  invalid: { tone: 'warn', text: 'That form was not complete. Nothing changed.' },
}

function matchWords(p: WaitingPhoto): string {
  if (p.source === 'venue' || p.source === 'organiser') return 'Sent by the venue'
  const distance = p.matchDistanceM === null ? '' : `, ${Math.round(p.matchDistanceM)} m away`
  if (p.matchMethod === 'review') return `Matched for review${distance}: check it shows this venue`
  if (p.matchMethod === 'manual') return 'Matched by hand'
  return `Matched by name and place${distance}`
}

function PhotoFacts({ p }: { p: WaitingPhoto }) {
  return (
    <div className="text-xs text-white/60">
      {p.challengeReason && <p className="mb-1 text-amber-200">Taken down after a concern: &ldquo;{p.challengeReason}&rdquo; Approve it to show it again, or refuse it.</p>}
      <p className="text-white/80">{p.credit}</p>
      <p className="mt-1">
        {LICENCE_WORDS[p.licence] ?? p.licence}
        {p.width && p.height ? `, ${p.width} x ${p.height}` : ''}
        {p.quality !== null ? `, quality ${p.quality}` : ''}
      </p>
      <p className={p.matchMethod === 'review' ? 'mt-1 text-amber-200' : 'mt-1'}>{matchWords(p)}</p>
      {p.permissionWords && <p className="mt-1">Their yes: &ldquo;{p.permissionWords}&rdquo;</p>}
      <p className="mt-1 break-all">
        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">
          Where it came from
        </a>
      </p>
    </div>
  )
}

function ApproveForm({ p, venue, primary }: { p: WaitingPhoto; venue: string; primary: boolean }) {
  return (
    <form action={approveVenuePhotoAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="primary" value={primary ? 'yes' : 'no'} />
      {p.quality !== null ? (
        <input type="hidden" name="quality" value={p.quality} />
      ) : (
        <>
          <label htmlFor={`q-${p.id}`} className="text-xs text-white/60">
            Quality, 0 to 100
          </label>
          <input id={`q-${p.id}`} name="quality" type="number" min={0} max={100} step={1} required className="min-h-[44px] rounded-md border border-white/15 bg-[#131A2A] px-2 text-sm text-white" />
        </>
      )}
      <button
        type="submit"
        className={`${CONTROL} w-full justify-center rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300/60`}
      >
        {primary ? `Approve for ${venue}` : 'Approve as another photo'}
      </button>
    </form>
  )
}

function RefuseForm({ p }: { p: WaitingPhoto }) {
  return (
    <form action={refuseVenuePhotoAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={p.id} />
      <label className="sr-only" htmlFor={`r-${p.id}`}>
        Why it is refused
      </label>
      <input id={`r-${p.id}`} name="reason" required minLength={3} maxLength={200} placeholder="Why it is refused" className="min-h-[44px] rounded-md border border-white/15 bg-[#131A2A] px-2 text-xs text-white" />
      <button
        type="submit"
        className={`${CONTROL} w-full justify-center rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition hover:border-amber-300/40 hover:text-amber-200`}
      >
        Refuse
      </button>
    </form>
  )
}

function Venue({ v }: { v: WaitingVenue }) {
  const [best, ...rest] = v.photos
  return (
    <li data-venue={v.venueId} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h3 className="font-display text-lg font-semibold text-white">
        {v.venueName}
        {v.city ? <span className="font-normal text-white/50">, {v.city}</span> : null}
      </h3>
      <div className="mt-3 flex flex-col gap-4 md:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- a staff preview of a photograph waiting for approval, never a public image */}
        <img src={best.imageUrl} alt={`The photograph proposed for ${v.venueName}`} className="h-48 w-full rounded-lg object-cover md:w-80" />
        <div className="min-w-0 flex-1">
          <PhotoFacts p={best} />
        </div>
        <div className="flex flex-col gap-3 md:w-56">
          <ApproveForm p={best} venue={v.venueName} primary />
          <RefuseForm p={best} />
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <li key={p.id} data-photo={p.id} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a staff preview of a photograph waiting for approval, never a public image */}
              <img src={p.imageUrl} alt={`Another photograph proposed for ${v.venueName}`} className="h-32 w-full rounded-lg object-cover" />
              <PhotoFacts p={p} />
              <ApproveForm p={p} venue={v.venueName} primary={false} />
              <RefuseForm p={p} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * LAWAL'S VENUE PHOTO QUEUE (the project manager's 16:52 of 30 October 2026, G): every photograph of one of our venues
 * waiting for a person, a venue at a time, the best pre-picked so one tap approves it for every night there. Nothing
 * here shows publicly until it is approved.
 */
export default async function AdminVenuePhotosPage({ searchParams }: { searchParams: Promise<{ status?: string; why?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.venues.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.venues.photos.view', session })

  const { status, why } = await searchParams
  let venues: WaitingVenue[] = []
  let unmatched = 0
  let unreadable = false
  try {
    const deps = venueMediaDeps()
    ;[venues, unmatched] = await Promise.all([waitingVenuePhotos(deps), unmatchedCandidateCount(deps)])
  } catch {
    unreadable = true
  }
  const notice = status === 'refused' ? { tone: 'warn' as const, text: why ?? 'The database refused that change.' } : status ? NOTICES[status] : undefined

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Venues</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Venue photographs</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Photographs of our venues, from the venues themselves or freely licensed. Approve one once and it shows on every night at that venue, with its credit.
        </p>
      </header>

      {notice && (
        <div
          role={notice.tone === 'ok' ? 'status' : 'alert'}
          className={
            notice.tone === 'ok'
              ? 'mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200'
              : 'mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200'
          }
        >
          {notice.text}
        </div>
      )}

      {unreadable ? (
        <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-sm text-amber-200">
          The venue photographs could not be read just now. Refresh in a minute.
        </p>
      ) : (
        <>
          <h2 className="mb-3 font-display text-lg font-semibold">Waiting for you ({venues.length} venue{venues.length === 1 ? '' : 's'})</h2>
          {unmatched > 0 && <p className="mb-4 text-sm text-white/60">{unmatched} more found but not yet matched to one of our venues.</p>}
          {venues.length === 0 ? (
            <p className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/60">Nothing is waiting.</p>
          ) : (
            <ul className="space-y-4">
              {venues.map((v) => (
                <Venue key={v.venueId} v={v} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
