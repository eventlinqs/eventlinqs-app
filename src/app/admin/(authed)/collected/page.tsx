import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { PROVIDER_NAMES, providerOf } from '@/lib/events/booking-links'
import { acceptCandidateAction, refuseCandidateAction } from './actions'
import { REFUSAL_REASONS } from './reasons'
import {
  ADMIN_CELL,
  ADMIN_CELL_ACTIONS,
  ADMIN_CELL_LABEL,
  ADMIN_CELL_NAME,
  ADMIN_ROW,
  ADMIN_ROW_CONTROL,
  ADMIN_TABLE,
  ADMIN_TABLE_WRAP,
  ADMIN_TBODY,
  ADMIN_THEAD,
} from '@/components/admin/table-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Collected events | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string }>
type Link = { url: string; availability: string; priceFromCents: number | null }

const WHEN = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  accepted: { tone: 'ok', text: 'Accepted. A new listing goes out with the next import; added links are on the event now.' },
  refused: { tone: 'ok', text: 'Refused, with its reason kept.' },
  gone: { tone: 'warn', text: 'That one was already reviewed. The list below is current.' },
  invalid: { tone: 'warn', text: 'That review was not valid. Refresh and try again.' },
  error: { tone: 'warn', text: 'The links could not be written. Nothing changed; try again.' },
}

/**
 * WHAT THE WEEKLY COLLECTION RUN FOUND, FOR A PERSON TO REVIEW (item 19; docs/walk-in/COLLECTION-RUN.md). Nothing the
 * run finds is published until someone here accepts it. The register beneath shows every source, what its terms
 * allow and what the last run made of it.
 */
export default async function AdminCollectedPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.events.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.collected.view', session })

  const { status } = await searchParams
  const db = createAdminClient()
  const [waiting, sources] = await Promise.all([
    readOrThrow('admin-collected', () =>
      db
        .from('listing_candidates')
        .select('id, kind, event_id, title, starts_at, venue_name, venue_address, page_url, links, source:listing_sources(name), event:events(title, slug)')
        .eq('status', 'waiting')
        .order('starts_at', { ascending: true })
        .limit(200),
    ),
    readOrThrow('admin-collected-register', () =>
      db.from('listing_sources').select('id, name, kind, city_slug, page_url, collection, changes, last_checked_at, last_outcome').order('name'),
    ),
  ])
  const notice = status ? NOTICES[status] : undefined

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Listings</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Collected events</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          What the weekly run found on the sources whose own terms allow it. Nothing here is live until you accept it.
          An event we already list only gains its booking links, never a second card.
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

      <h2 className="mb-3 font-display text-lg font-semibold">Waiting for review ({(waiting ?? []).length})</h2>
      {(waiting ?? []).length === 0 ? (
        <p className="mb-10 rounded-md border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/60">
          Nothing is waiting. The next run is Monday at 6 am.
        </p>
      ) : (
        <div className={`relative mb-10 ${ADMIN_TABLE_WRAP}`}>
          <table className={`${ADMIN_TABLE} lg:min-w-[900px]`}>
            <thead className={ADMIN_THEAD}>
              <tr className="border-b border-white/[0.08] text-left text-white/50">
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-4 py-3 font-medium">Where</th>
                <th scope="col" className="px-4 py-3 font-medium">Sells on</th>
                <th scope="col" className="px-4 py-3 font-medium">Found on</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Review</span></th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {(waiting ?? []).map((c) => {
                const links = (c.links ?? []) as Link[]
                const source = (Array.isArray(c.source) ? c.source[0] : c.source) as { name: string } | null
                const event = (Array.isArray(c.event) ? c.event[0] : c.event) as { title: string; slug: string } | null
                return (
                  <tr key={c.id} className={`${ADMIN_ROW} align-top`} data-candidate={c.id}>
                    <td className={ADMIN_CELL_NAME}>
                      <div className="font-medium text-white">{c.title}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {c.kind === 'adds_links' && event ? (
                          <>
                            Adds links to{' '}
                            <Link href={`/events/${event.slug}`} className={`${ADMIN_ROW_CONTROL} underline underline-offset-2 hover:text-white`}>
                              {event.title}
                            </Link>
                          </>
                        ) : (
                          'New listing'
                        )}
                      </div>
                    </td>
                    <td className={`${ADMIN_CELL} whitespace-nowrap text-white/70`}>
                      <span className={ADMIN_CELL_LABEL}>When</span>
                      {WHEN.format(new Date(c.starts_at as string))}
                    </td>
                    <td className={`${ADMIN_CELL} text-white/70`}>
                      <span className={ADMIN_CELL_LABEL}>Where</span>
                      {c.venue_name}
                      {c.venue_address && <div className="text-xs text-white/40">{c.venue_address}</div>}
                    </td>
                    <td className={`${ADMIN_CELL} text-white/70`}>
                      <span className={ADMIN_CELL_LABEL}>Sells on</span>
                      {links.length === 0
                        ? 'No booking link on the page'
                        : links.map((l, i) => (
                            <span key={l.url}>
                              {i > 0 && ', '}
                              <a href={l.url} target="_blank" rel="noopener noreferrer" className={`${ADMIN_ROW_CONTROL} underline underline-offset-2 hover:text-white`}>
                                {PROVIDER_NAMES[providerOf(l.url)] ?? hostOf(l.url)}
                              </a>
                              {l.availability === 'sold_out' && ' (sold out)'}
                            </span>
                          ))}
                    </td>
                    <td className={`${ADMIN_CELL} text-white/70`}>
                      <span className={ADMIN_CELL_LABEL}>Found on</span>
                      <a href={c.page_url as string} target="_blank" rel="noopener noreferrer" className={`${ADMIN_ROW_CONTROL} underline underline-offset-2 hover:text-white`}>
                        {source?.name ?? hostOf(c.page_url as string)}
                      </a>
                    </td>
                    <td className={ADMIN_CELL_ACTIONS}>
                      <div className="flex flex-col gap-2">
                        <form action={acceptCandidateAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className={`${ADMIN_ROW_CONTROL} w-full justify-center rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300/60`}
                          >
                            Accept
                          </button>
                        </form>
                        <form action={refuseCandidateAction} className="flex flex-col gap-2">
                          <input type="hidden" name="id" value={c.id} />
                          <label className="sr-only" htmlFor={`reason-${c.id}`}>
                            Why it is refused
                          </label>
                          <select
                            id={`reason-${c.id}`}
                            name="reason"
                            className="min-h-[44px] rounded-md border border-white/15 bg-[#131A2A] px-2 text-xs text-white"
                            defaultValue={REFUSAL_REASONS[0]}
                          >
                            {REFUSAL_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className={`${ADMIN_ROW_CONTROL} w-full justify-center rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition hover:border-amber-300/40 hover:text-amber-200`}
                          >
                            Refuse
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold">The source register ({(sources ?? []).length})</h2>
      <div className={`relative ${ADMIN_TABLE_WRAP}`}>
        <table className={`${ADMIN_TABLE} lg:min-w-[800px]`}>
          <thead className={ADMIN_THEAD}>
            <tr className="border-b border-white/[0.08] text-left text-white/50">
              <th scope="col" className="px-4 py-3 font-medium">Source</th>
              <th scope="col" className="px-4 py-3 font-medium">Its terms</th>
              <th scope="col" className="px-4 py-3 font-medium">Changes</th>
              <th scope="col" className="px-4 py-3 font-medium">Last checked</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {(sources ?? []).map((s) => (
              <tr key={s.id} className={`${ADMIN_ROW} align-top`}>
                <td className={ADMIN_CELL_NAME}>
                  <a href={s.page_url as string} target="_blank" rel="noopener noreferrer" className={`${ADMIN_ROW_CONTROL} font-medium text-white underline underline-offset-2`}>
                    {s.name}
                  </a>
                  <div className="text-xs text-white/40">
                    {s.kind}
                    {s.city_slug ? `, ${s.city_slug}` : ''}
                  </div>
                </td>
                <td className={`${ADMIN_CELL} text-white/70`}>
                  <span className={ADMIN_CELL_LABEL}>Its terms</span>
                  {s.collection === 'read' ? 'Read weekly' : s.collection === 'ask' ? 'Ask them to submit' : 'Never read'}
                </td>
                <td className={`${ADMIN_CELL} text-white/70`}>
                  <span className={ADMIN_CELL_LABEL}>Changes</span>
                  {s.changes}
                </td>
                <td className={`${ADMIN_CELL} text-white/70`}>
                  <span className={ADMIN_CELL_LABEL}>Last checked</span>
                  {s.last_checked_at ? WHEN.format(new Date(s.last_checked_at as string)) : 'Not yet'}
                  {s.last_outcome && <div className="text-xs text-white/40">{s.last_outcome}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
