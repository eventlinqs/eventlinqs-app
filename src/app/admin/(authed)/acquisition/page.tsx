import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrganiserScores } from '@/lib/outreach/organiser-score-read'
import { PARTS, WEIGHTS, type Part } from '@/lib/outreach/organiser-score'
import { COHORT_SIZE, pickCohort } from '@/lib/outreach/cohort-pick'
import { ACQUISITION_STATES, STATE_WORDS, isAcquisitionState, type AcquisitionState } from '@/lib/outreach/acquisition-states'
import { readDailyQueue } from '@/lib/outreach/daily-queue'
import { CHANNEL_WORDS, nextStepWords, notReady, openInApp, stepWords, type QueueChannel } from '@/lib/outreach/daily-queue-math'
import { markSentAction } from './actions'
import { DailyQueueItem } from './daily-queue-item'
import { readVoicePolicy } from '@/lib/outreach/voice-gate'
import { ADMIN_CELL, ADMIN_CELL_LABEL, ADMIN_CELL_NAME, ADMIN_ROW, ADMIN_TABLE, ADMIN_TABLE_WRAP, ADMIN_TBODY, ADMIN_THEAD } from '@/components/admin/table-card'

/**
 * THE ORGANISER PIPELINE, IN ADMIN (window 6, 30 October 2026; the growth blueprint's rulings 3, 4 and 5). Every
 * organiser in the CRM with its acquisition state (decided by the database from its proof, migration 20261030034001),
 * its score out of 100 with each part and the reason for it (src/lib/outreach/organiser-score.ts), and whether the first
 * cohort picks it, by email or another route (src/lib/outreach/cohort-pick.ts). Figures only: what waits for Lawal is
 * on /admin/today. Staff only, never indexed. Above them, Lawal's daily outreach queue (the PROJECT MANAGER's 05:00 of
 * 31 October 2026, src/lib/outreach/daily-queue-math.ts): the one write here is his press of Sent, which records a
 * message he sent by hand (./actions.ts). Nothing here sends.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Organiser pipeline | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const PART_LABEL: Record<Part, string> = {
  frequency: 'Frequency',
  fit: 'Fit',
  value: 'Value',
  readiness: 'Readiness',
  completeness: 'Detail',
  partnership: 'Partnership',
}

const OPEN_LABEL = { instagram: 'Open in Instagram', facebook: 'Open their Page', website_form: 'Open the form', email: 'Open in mail' } as const

export default async function AdminAcquisitionPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const { said } = await searchParams
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.acquisition.view', session })

  const db = createAdminClient()
  const rows = await readOrganiserScores(db, new Date())
  const states = await db.from('organisers').select('id, acquisition_state')
  if (states.error) throw new Error(`organisers: ${states.error.message}`)
  const stateOf = new Map<string, AcquisitionState>()
  for (const s of states.data ?? []) if (isAcquisitionState(s.acquisition_state)) stateOf.set(s.id, s.acquisition_state)

  const scored = rows.flatMap((r) => (r.state === 'scored' ? [r] : []))
  const cohort = pickCohort(scored.map((r) => ({ id: r.id, city: r.city, score: r.score, writableEmail: r.writableEmail })))
  const byEmail = new Set(cohort.email.map((c) => c.id))
  const byOther = new Set(cohort.otherRoutes.map((c) => c.id))
  const counts = ACQUISITION_STATES.map((s) => ({ state: s, n: [...stateOf.values()].filter((v) => v === s).length })).filter((c) => c.n > 0)
  // A queue that could not be read is said so, never shown as an empty day.
  let queue: QueueChannel[] | null = null
  let policyVersion = ''
  try {
    policyVersion = readVoicePolicy().version
    queue = await readDailyQueue(db, new Date())
  } catch (err) {
    console.warn('[admin/acquisition] the daily queue could not be read', err instanceof Error ? err.message : String(err))
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Organiser pipeline</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Each organiser&apos;s acquisition state, as its own records prove it, and its score out of 100: frequency {WEIGHTS.frequency}, fit {WEIGHTS.fit}, value{' '}
          {WEIGHTS.value}, readiness {WEIGHTS.readiness}, detail {WEIGHTS.completeness}, partnership {WEIGHTS.partnership}. The score sets who is asked first;
          it predicts nothing.
        </p>
      </header>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
          {said}
        </p>
      )}

      <section id="queue" data-daily-queue aria-label="Today's queue" className="mb-8">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Today&apos;s queue</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Each message you send by hand, channel by channel, never more in a day than the channel allows. Copy it, open where it goes, send it there, then
          press Sent. Nothing here sends anything.
        </p>
        {queue === null ? (
          <p className="mt-4 text-sm text-white">The queue could not be read just now. Reload in a minute; nothing has been lost.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {queue.map((c) => (
              <div key={c.channel} data-channel={c.channel} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
                <h3 className="text-sm font-semibold text-white">{CHANNEL_WORDS[c.channel]}</h3>
                <p className="mt-1 text-xs text-white/60">
                  {c.sentToday} of {c.cap} sent today, {c.left} left
                  {c.waiting > 0 ? `; ${c.waiting} more ${c.waiting === 1 ? 'waits' : 'wait'} for another day` : ''}
                </p>
                {c.today.length === 0 ? (
                  <p className="mt-3 text-sm text-white/70">{c.left === 0 ? 'Done for today on this channel.' : 'Nothing is waiting on this channel.'}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-white/[0.06]">
                    {c.today.map((t) => {
                      const why = notReady(t)
                      const href = openInApp(t.channel, t.address, t.subject)
                      return (
                        <li key={t.touchId} data-touch={t.touchId} className="py-4">
                          <p className="text-sm font-semibold text-white">
                            {t.organiserName} <span className="font-normal text-white/60">| {stepWords(t)}</span>
                          </p>
                          {t.subject ? <p className="mt-1 text-xs text-white/60">Subject: {t.subject}</p> : null}
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{t.body}</p>
                          {why.length > 0 || href === null ? (
                            <p className="mt-3 text-sm text-white">Not ready: {why.join('; ')}.</p>
                          ) : (
                            <>
                              <DailyQueueItem touchId={t.touchId} contentHash={t.contentHash} policyVersion={policyVersion} body={t.body} openHref={href} openLabel={OPEN_LABEL[t.channel]} action={markSentAction} />
                              <p className="mt-2 text-xs text-white/50">{nextStepWords(t.step)}</p>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
          <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">By state</h2>
          <ul className="mt-3 space-y-1 text-sm text-white/70">
            {counts.map((c) => (
              <li key={c.state}>
                <span className="font-semibold text-white">{c.n}</span> {STATE_WORDS[c.state]}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
          <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">First cohort</h2>
          <p className="mt-3 text-sm text-white/70">
            <span className="font-semibold text-white">{cohort.total}</span> of {COHORT_SIZE} picked: {cohort.email.length} by email, {cohort.otherRoutes.length} by
            inbound, partnership or in person.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {Object.entries(cohort.quota).map(([city, quota]) => (
              <li key={city} className="capitalize">
                {city}: {cohort.byCity[city as keyof typeof cohort.byCity].length} of {quota}
                {cohort.short[city as keyof typeof cohort.short] > 0 ? `, ${cohort.short[city as keyof typeof cohort.short]} short` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-white/50">{cohort.outside} outside the four cities or with no city on record.</p>
        </div>
      </section>

      <div className={ADMIN_TABLE_WRAP}>
        <table className={`${ADMIN_TABLE} lg:min-w-[720px]`}>
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3">Organiser</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Score</th>
              {PARTS.map((p) => (
                <th key={p} className="px-4 py-3">
                  {PART_LABEL[p]}
                </th>
              ))}
              <th className="px-4 py-3">Cohort</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {rows.map((r) => {
              const state = stateOf.get(r.id)
              return (
                <tr key={r.id} className={`${ADMIN_ROW} align-top`}>
                  <td className={`${ADMIN_CELL_NAME} text-white`}>
                    {r.name}
                    <span className="block text-xs text-white/50">
                      {r.city ? `${r.city.replace(/-/g, ' ')}${r.citySource === 'source_file' ? ' (from its source file)' : ''}` : 'No city on record'}
                    </span>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>State</span>
                    {state ? STATE_WORDS[state] : 'Not yet read'}
                  </td>
                  {r.state === 'scored' ? (
                    <>
                      <td className={`${ADMIN_CELL} font-semibold text-white`}>
                        <span className={ADMIN_CELL_LABEL}>Score</span>
                        {r.score}
                      </td>
                      {PARTS.map((p) => (
                        <td key={p} className={`${ADMIN_CELL} text-white/70`} title={r.why[p]}>
                          <span className={ADMIN_CELL_LABEL}>{PART_LABEL[p]}</span>
                          {r.parts[p]}
                          <span className="block text-xs text-white/50">{r.why[p]}</span>
                        </td>
                      ))}
                    </>
                  ) : (
                    <td className={`${ADMIN_CELL} text-white/60`} colSpan={PARTS.length + 1}>
                      Not scored: they said no or stop.
                    </td>
                  )}
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Cohort</span>
                    {byEmail.has(r.id) ? 'By email' : byOther.has(r.id) ? 'Another route' : 'Not picked'}
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
