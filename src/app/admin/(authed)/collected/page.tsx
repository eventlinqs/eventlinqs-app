import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { PROVIDER_NAMES, providerOf } from '@/lib/events/booking-links'
import {
  ACQUISITION_PATHS,
  FAILING_AFTER_RUNS,
  SOURCE_TYPE_LABELS,
  failuresInARow,
  sourceFreshness,
  type SourceChanges,
  type SourceType,
} from '@/lib/listings/collect'
import { HORIZONS, HORIZON_LABELS, horizonOf } from '@/lib/listings/horizon'
import { REASON_LABELS, type CandidateReason } from '@/lib/listings/judge'
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

/** The five permission answers (the checklist's D2), each yes, no or unknown with its own quoted, dated evidence. */
const PERMISSION_ANSWERS = [
  { column: 'may_scrape', label: 'Scraping' },
  { column: 'may_use_dataset', label: 'Licensed API or dataset' },
  { column: 'may_subscribe', label: 'Subscription feed' },
  { column: 'may_redistribute_facts', label: 'Facts redistributed' },
  { column: 'may_reuse_media', label: 'Photos, posters, descriptions' },
] as const

/* Written out whole so the generated types read every column (a built string types as an error). */
const REGISTER_COLUMNS =
  'id, name, kind, city_slug, page_url, collection, changes, last_checked_at, last_outcome, last_success_at, source_type, acquisition_order, verification, verified_on, licence_owner, contact, permits_facts, permits_descriptions, permits_images, permits_links, may_scrape, may_scrape_quote, may_scrape_read_on, may_use_dataset, may_use_dataset_quote, may_use_dataset_read_on, may_subscribe, may_subscribe_quote, may_subscribe_read_on, may_redistribute_facts, may_redistribute_facts_quote, may_redistribute_facts_read_on, may_reuse_media, may_reuse_media_quote, may_reuse_media_read_on' as const

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  accepted: { tone: 'ok', text: 'Accepted. A new listing goes out with the next import; added links are on the event now; a changed time or venue is yours to make on the event.' },
  refused: { tone: 'ok', text: 'Refused, with its reason kept.' },
  gone: { tone: 'warn', text: 'That one was already reviewed. The list below is current.' },
  invalid: { tone: 'warn', text: 'That review was not valid. Refresh and try again.' },
  error: { tone: 'warn', text: 'The links could not be written. Nothing changed; try again.' },
}

/**
 * THE EXCEPTION QUEUE (item 19; the engine plan of 28 October 2026, part E; docs/walk-in/COLLECTION-RUN.md): what the
 * daily collection run found that needs a person, soonest first, each row saying why it waits and which horizon it is
 * in (publish 0 to 14 days, acquire 15 to 45, relationships 46 to 90). A high confidence find from a partner's own
 * verified feed is accepted by the partner rule and never waits here. The register beneath shows every source, what
 * its terms allow, and its last five runs, flagged after three failures in a row.
 */

/** Enough of the run log for every source's last five runs while the register holds up to 100 daily sources. */
const RUNS_READ = 500
const RUNS_SHOWN = 5
export default async function AdminCollectedPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.events.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.collected.view', session })

  const { status } = await searchParams
  const db = createAdminClient()
  const [waiting, sources, runs] = await Promise.all([
    readOrThrow('admin-collected', () =>
      db
        .from('listing_candidates')
        .select('id, kind, event_id, change, title, starts_at, venue_name, venue_address, page_url, links, confidence, reasons, source:listing_sources(name), event:events(title, slug)')
        .eq('status', 'waiting')
        .order('starts_at', { ascending: true })
        .limit(200),
    ),
    readOrThrow('admin-collected-register', () =>
      db.from('listing_sources').select(REGISTER_COLUMNS).order('acquisition_order').order('name'),
    ),
    readOrThrow('admin-collected-runs', () =>
      db.from('listing_source_runs').select('source_id, ran_at, succeeded, outcome').order('ran_at', { ascending: false }).limit(RUNS_READ),
    ),
  ])
  const notice = status ? NOTICES[status] : undefined
  const now = new Date()
  const runsBySource = new Map<string, { ran_at: string; succeeded: boolean; outcome: string }[]>()
  for (const run of runs ?? []) {
    const list = runsBySource.get(run.source_id as string) ?? []
    if (list.length < RUNS_SHOWN) list.push(run as { ran_at: string; succeeded: boolean; outcome: string })
    runsBySource.set(run.source_id as string, list)
  }
  const byHorizon = HORIZONS.map((h) => ({ h, n: (waiting ?? []).filter((c) => horizonOf(new Date(c.starts_at as string), now) === h).length }))

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Listings</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Collected events</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          What the daily run found on the sources whose own terms allow it and could not settle on its own. Nothing here
          is live until you accept it. An event we already list only gains its booking links, never a second card, and a
          changed time or venue always comes to you.
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
      <ul className="mb-4 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3" data-horizons>
        {byHorizon.map(({ h, n }) => (
          <li key={h} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2" data-horizon={h}>
            {HORIZON_LABELS[h]}: <span className="font-display font-semibold text-white">{n}</span>
          </li>
        ))}
      </ul>
      {(waiting ?? []).length === 0 ? (
        <p className="mb-10 rounded-md border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/60">
          Nothing is waiting. The next run is tomorrow morning.
        </p>
      ) : (
        <div className={`relative mb-10 ${ADMIN_TABLE_WRAP}`}>
          <table className={`${ADMIN_TABLE} lg:min-w-[1050px]`}>
            <thead className={ADMIN_THEAD}>
              <tr className="border-b border-white/[0.08] text-left text-white/50">
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 font-medium">Why it waits</th>
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
                const reasons = (c.reasons ?? []) as string[]
                const horizon = horizonOf(new Date(c.starts_at as string), now)
                return (
                  <tr key={c.id} className={`${ADMIN_ROW} align-top`} data-candidate={c.id} data-horizon={horizon} data-confidence={c.confidence}>
                    <td className={ADMIN_CELL_NAME}>
                      <div className="font-medium text-white">{c.title}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {(c.kind === 'adds_links' || c.kind === 'changes_facts') && event ? (
                          <>
                            {c.kind === 'adds_links' ? 'Adds links to' : c.change === 'venue_changed' ? 'Venue changed on' : 'Time changed on'}{' '}
                            <Link href={`/events/${event.slug}`} className={`${ADMIN_ROW_CONTROL} underline underline-offset-2 hover:text-white`}>
                              {event.title}
                            </Link>
                          </>
                        ) : (
                          'New listing'
                        )}
                      </div>
                    </td>
                    <td className={`${ADMIN_CELL} text-white/70`}>
                      <span className={ADMIN_CELL_LABEL}>Why it waits</span>
                      <div className="text-xs text-white/50">{HORIZON_LABELS[horizon]}</div>
                      {reasons.length === 0 ? (
                        <div className="text-xs">Nothing doubtful; not a partner&apos;s own feed</div>
                      ) : (
                        <ul className="space-y-0.5 text-xs text-amber-200" data-reasons={reasons.join(' ')}>
                          {reasons.map((r) => (
                            <li key={r}>{REASON_LABELS[r as CandidateReason] ?? 'Found before the queue judged it'}</li>
                          ))}
                        </ul>
                      )}
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
      <p className="mb-3 max-w-2xl text-sm text-white/60">
        Where events come from, in the order we grow them. Each source is read only where its own answers allow it.
      </p>
      <ol className="mb-4 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-2 lg:grid-cols-4" data-acquisition-order>
        {ACQUISITION_PATHS.map((p) => (
          <li key={p.order} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2" data-path={p.order}>
            <span className="font-display font-semibold text-white">{p.order}.</span> {p.label}
            <span className="ml-1 text-white/40">({(sources ?? []).filter((s) => s.acquisition_order === p.order).length})</span>
          </li>
        ))}
      </ol>
      <div className={`relative ${ADMIN_TABLE_WRAP}`}>
        <table className={`${ADMIN_TABLE} lg:min-w-[1250px]`}>
          <thead className={ADMIN_THEAD}>
            <tr className="border-b border-white/[0.08] text-left text-white/50">
              <th scope="col" className="px-4 py-3 font-medium">Source</th>
              <th scope="col" className="px-4 py-3 font-medium">Its terms</th>
              <th scope="col" className="px-4 py-3 font-medium">Permission</th>
              <th scope="col" className="px-4 py-3 font-medium">We may use</th>
              <th scope="col" className="px-4 py-3 font-medium">Last collected</th>
              <th scope="col" className="px-4 py-3 font-medium">Last runs</th>
              <th scope="col" className="px-4 py-3 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {(sources ?? []).map((s) => {
              const freshness = sourceFreshness({ changes: s.changes as SourceChanges, lastSuccessAt: s.last_success_at as string | null }, now)
              const path = ACQUISITION_PATHS.find((p) => p.order === s.acquisition_order)
              const content = [s.permits_facts && 'facts', s.permits_descriptions && 'descriptions', s.permits_images && 'images', s.permits_links && 'links'].filter(Boolean)
              const lastRuns = runsBySource.get(s.id as string) ?? []
              const inARow = failuresInARow(lastRuns)
              return (
                <tr key={s.id} className={`${ADMIN_ROW} align-top`} data-source={s.id} data-source-type={s.source_type}>
                  <td className={ADMIN_CELL_NAME}>
                    <a href={s.page_url as string} target="_blank" rel="noopener noreferrer" className={`${ADMIN_ROW_CONTROL} font-medium text-white underline underline-offset-2`}>
                      {s.name}
                    </a>
                    <div className="text-xs text-white/40">
                      {path ? `${path.order}. ` : ''}
                      {SOURCE_TYPE_LABELS[s.source_type as SourceType] ?? s.source_type}
                      {`, ${s.kind}`}
                      {s.city_slug ? `, ${s.city_slug}` : ''}
                    </div>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Its terms</span>
                    {s.collection === 'read' ? `Read ${s.changes}` : s.collection === 'ask' ? 'Ask them to submit' : 'Never read'}
                    <div className="text-xs text-white/40">
                      {s.verification === 'verified' && s.verified_on ? `Verified ${s.verified_on}` : s.verification === 'needs_recheck' ? 'Needs a recheck' : 'Not verified'}
                    </div>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Permission</span>
                    <ul className="space-y-0.5 text-xs">
                      {PERMISSION_ANSWERS.map((a) => {
                        const answer = s[a.column] as string
                        const quote = s[`${a.column}_quote` as const] as string | null
                        const read = s[`${a.column}_read_on` as const] as string | null
                        return (
                          <li key={a.column} title={quote ?? undefined} data-answer={a.column} data-value={answer}>
                            {a.label}: <span className={answer === 'yes' ? 'text-emerald-200' : answer === 'no' ? 'text-amber-200' : 'text-white/40'}>{answer}</span>
                            {read ? <span className="text-white/40"> ({read})</span> : null}
                          </li>
                        )
                      })}
                    </ul>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>We may use</span>
                    {content.length === 0 ? 'Nothing' : content.join(', ')}
                    <div className="text-xs text-white/40">Changes {s.changes}</div>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Last collected</span>
                    <span data-freshness={freshness}>
                      {s.last_success_at ? WHEN.format(new Date(s.last_success_at as string)) : 'Never collected'}
                      {freshness === 'stale' && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-200">Stale</span>}
                    </span>
                    {s.last_checked_at && (
                      <div className="text-xs text-white/40">
                        Checked {WHEN.format(new Date(s.last_checked_at as string))}
                        {s.last_outcome ? `: ${s.last_outcome}` : ''}
                      </div>
                    )}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Last runs</span>
                    {lastRuns.length === 0 ? (
                      'No run yet'
                    ) : (
                      <>
                        {inARow >= FAILING_AFTER_RUNS && (
                          <span className="mb-1 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-200" data-failing>
                            Failed {inARow} runs in a row
                          </span>
                        )}
                        <ol className="space-y-0.5 text-xs" data-runs={lastRuns.length}>
                          {lastRuns.map((run) => (
                            <li key={run.ran_at} title={run.outcome} className={run.succeeded ? 'text-white/60' : 'text-amber-200'}>
                              {WHEN.format(new Date(run.ran_at))}: {run.succeeded ? 'read' : 'failed'}
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Owner</span>
                    {s.licence_owner ?? 'Not recorded'}
                    {s.contact && <div className="break-all text-xs text-white/40">{s.contact}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
