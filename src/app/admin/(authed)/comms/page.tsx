import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { readCentre } from '@/lib/comms/centre'
import type { Figures } from '@/lib/comms/centre-math'
import { proposedReply, readDecisions } from '@/lib/comms/decisions'
import { readVoicePolicy } from '@/lib/outreach/voice-gate'
import { approveAndSendAction, closeWithoutReplyAction } from './actions'
import { graphConfigFromEnv } from '@/lib/outreach/graph'
import { graphIdOf, graphPhotosOf, type InboundAttachment } from '@/lib/comms/inbound-attachments'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Communications centre | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * THE GROWTH AND COMMUNICATIONS CENTRE (Law 24; Lawal's master communications directive of 18 November 2026,
 * section 7: "one Growth & Communications Centre ... separate sections for: Organiser Acquisition. Event Permissions.
 * Listing Communications. Social Media Marketing. Organiser Retention. Ticketing Conversion. System Operations.").
 *
 * Seven sections, in his order, each with the ten figures he named, counted from the database by the one category every
 * message record carries (src/lib/comms/centre.ts). A figure no record can hold says so; it is never shown as a zero.
 * Above them, NEEDS YOUR DECISION (law 30, the CRM directive's section 5): every reply held for Lawal, with who wrote,
 * their words and the message they answered, and the proposed reply he edits; APPROVE AND SEND sends it from the
 * outreach mailbox in their thread once the gateway's rules pass, and CLOSE WITHOUT A REPLY sends nothing.
 */
const FIGURES: { key: keyof Omit<Figures, 'lastUpdated'>; label: string; none: string }[] = [
  { key: 'total', label: 'Total records', none: '' },
  { key: 'pending', label: 'Pending', none: 'No waiting step' },
  { key: 'approved', label: 'Approved', none: 'No approval step' },
  { key: 'scheduled', label: 'Scheduled', none: 'Not scheduled' },
  { key: 'sent', label: 'Sent or published', none: 'Not sent from here' },
  { key: 'delivered', label: 'Delivered or confirmed', none: 'No provider confirms it' },
  { key: 'failed', label: 'Failed', none: 'Not recorded' },
  { key: 'outcomes', label: 'Replies or outcomes', none: 'Not measured yet' },
  { key: 'withdrawn', label: 'Withdrawn, never sent', none: 'Does not apply' },
]

export default async function AdminCommsCentrePage({ searchParams }: { searchParams: Promise<{ said?: string; tone?: string }> }) {
  const { said, tone } = await searchParams
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.comms.view', session })

  const db = createAdminClient()
  const [centre, decisions] = await Promise.all([readCentre(db, new Date()), readDecisions(db)])
  const signature = readVoicePolicy().replySignature
  // The photographs an organiser attached, listed from the outreach mailbox itself (law 30, section 4 A); a read that
  // fails says so on the reply and never stops the page.
  const photos = new Map<string, InboundAttachment[] | string>()
  const withPhotos = decisions.filter((d) => d.outcome === 'photographs' && d.sourceMessageId)
  if (withPhotos.length > 0) {
    const sender = await db.from('outreach_sender').select('from_address').eq('id', true).single()
    const cfg = sender.data ? graphConfigFromEnv(sender.data.from_address as string) : null
    for (const d of withPhotos) {
      if (!cfg) {
        photos.set(d.replyId, 'The outreach mailbox is not connected here, so the photographs cannot be shown.')
        continue
      }
      try {
        const graphId = await graphIdOf(cfg, d.sourceMessageId as string)
        photos.set(d.replyId, graphId ? await graphPhotosOf(cfg, graphId) : 'The message is no longer in the mailbox.')
      } catch {
        photos.set(d.replyId, 'The photographs could not be read from the mailbox just now.')
      }
    }
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Today</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Growth and Communications Centre</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Every message EventLinqs sends, in its one category, counted from the database. Read {formatPlatformDateTime(centre.readAt)}.
        </p>
      </header>

      {said ? (
        <p role={tone === 'ok' ? 'status' : 'alert'} data-said className={tone === 'ok' ? 'mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800' : 'mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800'}>
          {said}
        </p>
      ) : null}

      <section id="decisions" aria-labelledby="comms-decisions" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5 sm:p-6">
        <h2 id="comms-decisions" className="font-display text-lg font-semibold text-[var(--admin-ink)]">Needs your decision</h2>
        <p className="mt-1 text-sm text-[var(--admin-soft)]">
          {decisions.length === 0 ? 'No reply waits for you.' : `${decisions.length} ${decisions.length === 1 ? 'reply waits' : 'replies wait'} for you, newest first.`}
        </p>
        <ul className="mt-4 grid gap-4">
          {decisions.map((d) => (
            <li key={d.replyId} data-decision={d.replyId} className="rounded-lg border border-[var(--admin-line)] p-4">
              <p className="text-sm font-semibold text-[var(--admin-ink)]">
                {d.organiser ?? d.address} <span className="font-normal text-[var(--admin-muted)]">({d.address}), {formatPlatformDateTime(d.receivedAt)}</span>
              </p>
              {d.ourSubject ? <p className="mt-1 text-sm text-[var(--admin-soft)]">Answering our message: {d.ourSubject}</p> : null}
              <blockquote className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--admin-tint)] p-3 text-sm text-[var(--admin-soft)]">{d.theirWords}</blockquote>
              {(() => {
                const shown = photos.get(d.replyId)
                if (shown === undefined) return null
                if (typeof shown === 'string') return <p className="mt-3 text-sm text-[var(--admin-soft)]">{shown}</p>
                return (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-[var(--admin-ink)]">{shown.length === 1 ? 'One photograph attached' : `${shown.length} photographs attached`}</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {shown.map((a) => (
                        <li key={a.id}>
                          <a href={`/admin/comms/photo/${d.replyId}/${encodeURIComponent(a.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--admin-line-strong)] px-3 text-sm text-[var(--admin-ink)] hover:bg-[var(--admin-tint-strong)]">
                            {a.name} ({Math.max(1, Math.round(a.size / 1024))} KB)
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
              {d.channel === 'email' ? (
                <form action={approveAndSendAction} className="mt-4 grid gap-3">
                  <input type="hidden" name="replyId" value={d.replyId} />
                  <label htmlFor={`greeting-${d.replyId}`} className="text-sm font-medium text-[var(--admin-ink)]">
                    Greeting name
                  </label>
                  <input id={`greeting-${d.replyId}`} name="greetingName" defaultValue={d.greetingName} required maxLength={80} className="min-h-11 rounded-lg border border-[var(--admin-line-strong)] bg-[var(--admin-paper)] px-3 text-sm text-[var(--admin-ink)]" />
                  <label htmlFor={`body-${d.replyId}`} className="text-sm font-medium text-[var(--admin-ink)]">
                    Your reply
                  </label>
                  <textarea id={`body-${d.replyId}`} name="body" required rows={9} maxLength={5000} defaultValue={proposedReply(d.greetingName, signature)} className="rounded-lg border border-[var(--admin-line-strong)] bg-[var(--admin-paper)] px-3 py-2 text-sm text-[var(--admin-ink)]" />
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" className="min-h-11 rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-paper)]">
                      Approve and send
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-3 text-sm text-[var(--admin-soft)]">They wrote by {d.channel}; answer them there.</p>
              )}
              <form action={closeWithoutReplyAction} className="mt-3">
                <input type="hidden" name="replyId" value={d.replyId} />
                <button type="submit" className="min-h-11 rounded-lg border border-[var(--admin-line-strong)] px-4 text-sm font-medium text-[var(--admin-ink)]">
                  Close without a reply
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6">
        {centre.sections.map((s) => (
          <section key={s.category} data-category={s.category} aria-labelledby={`comms-${s.category}`} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`comms-${s.category}`} className="font-display text-lg font-semibold text-[var(--admin-ink)]">
                <span className="mr-2 font-mono text-sm text-[var(--brand-accent-strong)]">{s.category}</span>
                {s.name}
              </h2>
              <p className="text-sm text-[var(--admin-soft)]" data-last-updated>
                {s.figures.lastUpdated ? `Last updated ${formatPlatformDateTime(s.figures.lastUpdated)}` : 'Nothing recorded yet'}
              </p>
            </div>
            <p data-next-action className="mt-3 text-sm font-semibold text-[var(--admin-ink)]">
              Next action: {s.nextAction}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {FIGURES.map((f) => {
                const v = s.figures[f.key]
                return (
                  <div key={f.key} data-figure={f.key} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">{f.label}</dt>
                    <dd className={v === null ? 'mt-1 text-sm text-[var(--admin-muted)]' : 'mt-1 font-display text-2xl font-semibold text-[var(--admin-ink)]'}>
                      {v === null ? f.none : v.toLocaleString('en-AU')}
                    </dd>
                  </div>
                )
              })}
            </dl>
            {s.extra.length > 0 ? (
              <ul className="mt-4 space-y-1 text-sm text-[var(--admin-soft)]">
                {s.extra.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 text-xs text-[var(--admin-muted)]">Read from {s.sources.join('; ')}.</p>
          </section>
        ))}
      </div>
    </div>
  )
}
