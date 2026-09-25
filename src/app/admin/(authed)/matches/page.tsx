import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { readMatchConfig } from '@/lib/matching/config'
import { methodSentence, type BreakdownEntry } from '@/lib/matching/score'
import { SUPPRESSION_SENTENCES, type SuppressionReason } from '@/lib/matching/suppress'
import { formatEventDate, formatPlatformDate } from '@/lib/dates/event-time'
import { readMatchableEvents, readEventForMatching } from '@/lib/matching/events'
import { MatchRunForm } from './match-run-form'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Matches | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * WHO WOULD HEAR ABOUT THIS EVENT, AND WHY EACH OF THEM.
 *
 * Close-out GA2 step 8. One number first, the size of the list this run
 * produced, then the funnel from the audience considered down to the people
 * returned, then the method and version in plain words, then the arithmetic in
 * one English sentence, then the ranked people with their score and their
 * breakdown read as sentences rather than as raw JSON.
 *
 * NOTHING ON THIS PAGE SENDS. It produces and reads a ranked list; the campaign
 * that would use it is GA4, and no transport is reachable from here.
 *
 * ON LIGHT AND DARK. The admin console is one dark surface, with no theme
 * switch and no `dark:` variants anywhere in `src/components/admin`. This page
 * is built to that surface rather than inventing a second theme on one screen,
 * which would make this the odd page in the console; the deviation and the
 * reason are recorded in LANE-B-CLOSED.md rather than left as a silent choice.
 */

type Props = { searchParams: Promise<{ event?: string }> }

function decimals(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default async function AdminMatchesPage({ searchParams }: Props) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.matches.view', session })

  const { event: eventId } = await searchParams
  const admin = createAdminClient()

  /*
   * THE PICKER IS BOUND BY TIME, AND THE BOUND LIVES IN ONE PLACE.
   *
   * This read used to be composed here: published, public, ordered by
   * start_date ascending, forty of them, and no bound on time at all, under a
   * comment claiming it listed the soonest events. Ordering EVERY published
   * event ascending and taking forty gives the forty OLDEST the platform has
   * ever had: on TEST, 101 of 276 were already over and the picker offered
   * nothing but June. See src/lib/matching/events.ts.
   */
  const [enabled, matchable] = await Promise.all([
    isFeatureEnabled('marketing_matcher_enabled'),
    readMatchableEvents(admin, new Date()),
  ])

  let config = null
  let configError: string | null = null
  try {
    config = await readMatchConfig(admin)
  } catch (error) {
    configError = error instanceof Error ? error.message : 'the configuration could not be read'
  }

  const selected = eventId
    ? (matchable.find(e => e.id === eventId) ?? (await readEventForMatching(admin, eventId)))
    : null

  const { data: run } = eventId
    ? await admin
        .from('marketing_match_run')
        .select(
          'id, event_id, method_name, method_version, requested_cap, audience_considered, suppressed_by_reason, returned_count, truncated, started_at, finished_at',
        )
        .eq('event_id', eventId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const { data: scores } = run
    ? await admin
        .from('marketing_match_score')
        .select('id, rank, score, breakdown, audience_member_id')
        .eq('run_id', run.id)
        .order('rank', { ascending: true })
        .limit(200)
    : { data: null }

  const funnel = (run?.suppressed_by_reason ?? {}) as Partial<Record<SuppressionReason, number>>
  const suppressedTotal = Object.values(funnel).reduce((sum, n) => sum + (n ?? 0), 0)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Matches</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Who inside the consented audience should hear about one event, and the arithmetic that
          decided it. Producing a match sends nothing: it writes a ranked list and the reasons
          behind it.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Pick an event</h2>
        <p className="mt-1 text-sm text-white/60">
          Only a published event can be matched. The cap defaults to the one in the configuration.
        </p>
        <MatchRunForm
          /*
           * The selected event is ALWAYS in the list, even when it is not one of
           * the soonest forty. Without this an address naming any other
           * published event rendered a picker that could not show it, which is
           * how the button came to refuse an event the page was describing.
           */
          /*
           * THE DATE IS RENDERED HERE, ON THE SERVER, AND TRAVELS AS A LABEL.
           *
           * An event's date takes the EVENT's zone (src/lib/dates/event-time.ts).
           * The picker used to slice the first ten characters off the stored
           * instant, which is the UTC calendar date, and that is a day EARLY for
           * every event whose local start is before its own offset: before 10 am
           * in Sydney, before 8 am in Perth. Rendering it here rather than in the
           * client also keeps @/lib/dates/event-time out of this route's bundle.
           */
          events={[
            ...(selected && !matchable.some(e => e.id === selected.id)
              ? [
                  {
                    id: selected.id,
                    title: selected.title,
                    dateLabel: formatEventDate(selected.startDate, selected.timezone),
                  },
                ]
              : []),
            ...matchable.map(e => ({
              id: e.id,
              title: e.title,
              dateLabel: formatEventDate(e.startDate, e.timezone),
            })),
          ]}
          selectedEventId={selected?.id ?? ''}
          defaultCap={config?.maxRecipientsPerRun ?? 0}
          matcherEnabled={enabled}
        />
        {configError && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            The matcher refuses to score: {configError}
          </p>
        )}
      </section>

      {!selected ? (
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-white">Pick an event to match</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
            Choose a published event above and press Produce a match. Nothing is listed here yet
            because a match belongs to one event: the same audience ranks differently for a Friday
            warehouse night and a Sunday family show, which is the whole point of ranking it.
          </p>
        </section>
      ) : !run ? (
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-white">
            No match has been produced for {selected.title} yet
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
            Press Produce a match above. It reads the consented audience, removes the people it must
            not contact and records why, scores the rest against this event, and keeps the top of
            the list up to the cap.
          </p>
        </section>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatTile
              label="People this run matched"
              value={run.returned_count}
              hint={`for ${selected.title}`}
              status={run.returned_count > 0 ? 'ok' : 'warn'}
            />
            <AdminStatTile
              label="Audience considered"
              value={run.audience_considered}
              hint="every consented buyer at the moment of the run"
            />
            <AdminStatTile
              label="Removed before scoring"
              value={suppressedTotal}
              hint="with a reason recorded for each"
              status={suppressedTotal > 0 ? 'warn' : 'ok'}
            />
            <AdminStatTile
              label="Cap"
              value={run.requested_cap}
              hint={run.truncated ? 'the list was longer and was cut here' : 'the list was shorter than the cap'}
              status={run.truncated ? 'warn' : 'ok'}
            />
          </div>

          <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">The funnel</h2>
            <p className="mt-1 text-sm text-white/60">
              From {run.audience_considered} in the audience to {run.returned_count} matched, and
              every person who dropped out is here with the reason they did.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-white/80">
              {(Object.keys(SUPPRESSION_SENTENCES) as SuppressionReason[]).map(reason => (
                <li key={reason} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                  <span className="text-white/70">{SUPPRESSION_SENTENCES[reason]}</span>
                  <span className="shrink-0 font-display text-base tabular-nums text-white">
                    {funnel[reason] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">How the score is worked out</h2>
            <p className="mt-2 text-sm text-white/70">
              Method {run.method_name} version {run.method_version}, run{' '}
              {formatPlatformDate(run.started_at)}.
            </p>
            {config && <p className="mt-2 text-sm text-white/60">{methodSentence(config)}</p>}
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">The ranked list</h2>
            {(scores ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-white/60">
                This run matched nobody. The funnel above says why, reason by reason.
              </p>
            ) : (
              <ul className="mt-5 space-y-2">
                {(scores ?? []).map(row => {
                  const breakdown = (row.breakdown ?? []) as unknown as BreakdownEntry[]
                  return (
                    <li key={row.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
                      <details>
                        <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                          <span className="text-sm text-white/70">
                            <span className="mr-3 inline-block w-8 tabular-nums text-white/40">
                              {row.rank}
                            </span>
                            Audience member {row.audience_member_id.slice(0, 8)}
                          </span>
                          <span className="font-display text-lg tabular-nums text-white">
                            {decimals(Number(row.score))}
                          </span>
                        </summary>
                        <ul className="space-y-2 border-t border-white/[0.06] px-4 py-3 text-sm text-white/70">
                          {breakdown.map(entry => (
                            <li key={entry.component} className="flex items-baseline justify-between gap-4">
                              <span>
                                {entry.sentence}{' '}
                                <span className="text-white/40">({entry.raw})</span>
                              </span>
                              <span className="shrink-0 tabular-nums text-white/60">
                                +{decimals(entry.contribution)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
