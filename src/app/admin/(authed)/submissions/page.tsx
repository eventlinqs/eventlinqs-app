import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { waitingSubmissions, type Submission } from '@/lib/listings/submission-store'
import { SUBMISSION_CITY_WORDS, SUBMISSION_ENTRY_WORDS, SUBMISSION_ROLE_WORDS } from '@/lib/listings/submission'
import { formatMoneyDisplay } from '@/lib/money/format'
import { acceptSubmissionAction, refuseSubmissionAction } from './actions'
import { SUBMISSION_REFUSALS } from './reasons'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Submitted events | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const WHEN = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  accepted: { tone: 'ok', text: 'Accepted. Add it to the next checked listings file; the import publishes it.' },
  refused: { tone: 'ok', text: 'Refused, with its reason kept.' },
  gone: { tone: 'warn', text: 'That one was already reviewed. The list below is current.' },
  invalid: { tone: 'warn', text: 'That review was not valid. Refresh and try again.' },
  error: { tone: 'warn', text: 'The review could not be written. Nothing changed; try again.' },
}

const CONTROL = 'inline-flex min-h-[44px] items-center'

/**
 * WHAT ORGANISERS SENT FROM /submit-event, FOR A PERSON TO REVIEW (release checklist H1). Each with its photo, its
 * booking page and the permission line in the words they agreed to. Nothing here is live until it is accepted and
 * goes out with the import.
 */
export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.events.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.submissions.view', session })

  const { status } = await searchParams
  let waiting: Submission[] = []
  let unreadable = false
  try {
    waiting = await waitingSubmissions(createAdminClient())
  } catch {
    unreadable = true
  }
  const notice = status ? NOTICES[status] : undefined

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Listings</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Submitted events</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Events organisers sent from List your event, each with their permission and any photo they say they own. Nothing here is live until you accept it.
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

      <h2 className="mb-3 font-display text-lg font-semibold">Waiting for review ({waiting.length})</h2>
      {unreadable ? (
        <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-sm text-amber-200">
          The submissions could not be read just now. Refresh in a minute.
        </p>
      ) : waiting.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/60">Nothing is waiting.</p>
      ) : (
        <ul className="space-y-4">
          {waiting.map((s) => (
            <li key={s.id} data-submission={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row">
                {s.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a staff preview through a ten minute signed address to a private bucket, never a public image
                  <img src={s.photoUrl} alt={`The photo sent with ${s.title}`} className="h-40 w-full rounded-lg object-cover md:w-56" />
                ) : (
                  <p data-no-photo className="flex h-40 w-full items-center justify-center rounded-lg border border-white/10 px-3 text-center text-xs text-white/50 md:w-56">
                    {s.photoSent ? 'The photo could not be shown' : 'No photo sent. Design it from the details.'}
                  </p>
                )}
                <div className="min-w-0 flex-1 text-sm text-white/70">
                  <h3 className="font-display text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-1">
                    {WHEN.format(new Date(s.startsAt))}
                    {s.endsAt ? ` to ${WHEN.format(new Date(s.endsAt))}` : ''}
                  </p>
                  <p className="mt-1">
                    {s.venueName}, {s.venueAddress} ({SUBMISSION_CITY_WORDS[s.city]})
                  </p>
                  <p className="mt-1">
                    {SUBMISSION_ENTRY_WORDS[s.entry]}
                    {s.priceFromCents !== null ? `, from ${formatMoneyDisplay(s.priceFromCents, 'AUD')}` : ''}
                  </p>
                  <p className="mt-1 break-all">
                    <a href={s.bookingUrl} target="_blank" rel="noopener noreferrer" className={`${CONTROL} underline underline-offset-2 hover:text-white`}>
                      {s.bookingUrl}
                    </a>
                  </p>
                  {s.description && <p className="mt-2 whitespace-pre-line text-white/60">{s.description}</p>}
                  <p className="mt-3 text-xs text-white/50">
                    From {s.name} ({SUBMISSION_ROLE_WORDS[s.role]}),{' '}
                    <a href={`mailto:${s.email}`} className="underline underline-offset-2">
                      {s.email}
                    </a>
                    , {WHEN.format(new Date(s.createdAt))}. They confirmed they can give permission, and agreed at {WHEN.format(new Date(s.permissionGivenAt))}: &ldquo;{s.permissionWords}&rdquo;
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:w-48">
                  <form action={acceptSubmissionAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className={`${CONTROL} w-full justify-center rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300/60`}
                    >
                      Accept
                    </button>
                  </form>
                  <form action={refuseSubmissionAction} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <label className="sr-only" htmlFor={`reason-${s.id}`}>
                      Why it is refused
                    </label>
                    <select
                      id={`reason-${s.id}`}
                      name="reason"
                      className="min-h-[44px] rounded-md border border-white/15 bg-[#131A2A] px-2 text-xs text-white"
                      defaultValue={SUBMISSION_REFUSALS[0]}
                    >
                      {SUBMISSION_REFUSALS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className={`${CONTROL} w-full justify-center rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition hover:border-amber-300/40 hover:text-amber-200`}
                    >
                      Refuse
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
