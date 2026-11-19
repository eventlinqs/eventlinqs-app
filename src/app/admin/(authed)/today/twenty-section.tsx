import { readVoicePolicy } from '@/lib/outreach/voice-gate'
import { nextStepWords, notReady, openInApp, stepWords } from '@/lib/outreach/daily-queue-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { SENT_RECENT_DAYS, type SentRecent, type TwentyView } from '@/lib/outreach/twenty-view'
import { DailyQueueItem } from '../acquisition/daily-queue-item'
import { logReplyAction, markSentAction } from '../acquisition/actions'

const OPEN_LABEL = { instagram: 'Open in Instagram', facebook: 'Open their Page', website_form: 'Open the form', email: 'Open in mail' } as const
const BASIS_WORDS: Record<string, string> = {
  conspicuous_publication: 'published address (conspicuous publication)',
  express_consent: 'express consent',
}

/**
 * TOMORROW'S TWENTY (Lawal, 12 November 2026, 11:11): each organiser, Melbourne first, with where their address was
 * published and the recorded Spam Act basis, then the draft the gateway judged, Copy, Open and Sent. Sent is
 * /admin/acquisition's own action and comes back here. Nothing on this screen sends anything.
 */
export function TwentySection({ view }: { view: { ok: true; v: TwentyView } | { ok: false; why: string } }) {
  let policyVersion = ''
  try {
    policyVersion = readVoicePolicy().version
  } catch {
    policyVersion = ''
  }
  return (
    <section id="twenty" data-section="twenty" aria-label="Tomorrow's twenty" className="mb-8 scroll-mt-24 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Tomorrow&apos;s twenty</h2>
      {!view.ok ? (
        <p className="mt-2 text-sm text-amber-800">The twenty could not be read just now ({view.why}). Nothing is lost.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--admin-soft)]">
            {view.v.total} organisers, Melbourne first, {view.v.drafted} with a draft ready. Copy each, send it from your own mail, then press Sent.
          </p>
          {view.v.groups.map((g) => (
            <div key={g.key} data-group={g.key} className="mt-5">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--admin-soft)]">
                {g.words}{g.short > 0 ? `, ${g.short} short today` : ''}
              </h3>
              {g.rows.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--admin-soft)]">No one in this group today.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--admin-line)]">
                  {g.rows.map(({ action: a, contact, draft }) => {
                    const why = draft ? notReady(draft) : []
                    const href = draft ? openInApp(draft.channel, draft.address, draft.subject) : null
                    return (
                      <li key={a.organiserId} data-twenty={a.organiserId} className="py-4">
                        <p className="text-sm font-semibold text-[var(--admin-ink)]">
                          {a.organiserName}
                          <span className="font-normal text-[var(--admin-soft)]">{a.city ? ` | ${a.city.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}` : ''} | {a.why}</span>
                        </p>
                        <p className="mt-1 text-xs text-[var(--admin-soft)] [overflow-wrap:anywhere]">
                          To {a.address} ({a.channel}).{' '}
                          {contact
                            ? `Basis: ${BASIS_WORDS[contact.basis] ?? contact.basis}${contact.basisRecordedAt ? `, recorded ${formatPlatformDateTime(contact.basisRecordedAt)}` : ''}.`
                            : 'Basis: not read.'}
                        </p>
                        {contact?.publishedOn ? (
                          <p className="mt-1 text-xs text-[var(--admin-soft)] [overflow-wrap:anywhere]">
                            Published at <a href={contact.publishedOn} className="underline underline-offset-2" rel="noreferrer noopener" target="_blank">{contact.publishedOn}</a>
                          </p>
                        ) : null}
                        {draft ? (
                          <>
                            <p className="mt-2 text-xs text-[var(--admin-soft)]">{stepWords(draft)}{draft.subject ? ` | Subject: ${draft.subject}` : ''}</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--admin-ink)] [overflow-wrap:anywhere]">{draft.body}</p>
                            {why.length > 0 || href === null || !policyVersion ? (
                              <p className="mt-3 text-sm text-[var(--admin-ink)]">Not ready: {[...why, ...(policyVersion ? [] : ['the voice policy could not be read'])].join('; ') || 'no way to open it'}.</p>
                            ) : (
                              <>
                                <DailyQueueItem touchId={draft.touchId} contentHash={draft.contentHash} policyVersion={policyVersion} body={draft.body} openHref={href} openLabel={OPEN_LABEL[draft.channel]} action={markSentAction} from="today" />
                                <p className="mt-2 text-xs text-[var(--admin-muted)]">{nextStepWords(draft.step)}</p>
                              </>
                            )}
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-[var(--admin-soft)]">No draft yet.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
          {view.v.socialFirstTouches.length > 0 ? (
            <p className="mt-5 text-xs text-[var(--admin-soft)]">
              Social first touches, no email allowed yet: {view.v.socialFirstTouches.map((s) => `${s.organiserName} (${s.handle})`).join(', ')}.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

const RECORD =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const OUTCOME_WORDS: readonly (readonly [string, string])[] = [
  ['interested', 'They replied: interested'],
  ['question', 'They replied with a question'],
  ['yes', 'They replied: yes'],
  ['later', 'They replied: later'],
  ['no', 'They replied: no'],
  ['stop', 'They asked not to be written to'],
  ['bounce', 'It bounced'],
]

/**
 * WHAT CAME BACK (Lawal's 11:11, item 2): every message he marked sent in the last fortnight that nothing is logged on
 * yet, each with one press to record a reply, a request to stop or a bounce, which stops its follow ups.
 */
export function SentRecentlySection({ view }: { view: { ok: true; v: readonly SentRecent[] } | { ok: false; why: string } }) {
  return (
    <section id="sent-recently" data-section="sent-recently" aria-label="Sent, waiting for an answer" className="mb-8 scroll-mt-24 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Sent, waiting for an answer</h2>
      {!view.ok ? (
        <p className="mt-2 text-sm text-amber-800">The messages sent could not be read just now ({view.why}). Nothing is lost.</p>
      ) : view.v.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--admin-soft)]">Nothing sent in the last {SENT_RECENT_DAYS} days is waiting for an answer.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--admin-soft)]">When a reply, a stop or a bounce comes in, record it here and its follow ups stop.</p>
          <ul className="mt-3 divide-y divide-[var(--admin-line)]">
            {view.v.map((s) => (
              <li key={s.touchId} data-sent={s.touchId} className="py-4">
                <p className="text-sm font-semibold text-[var(--admin-ink)]">
                  {s.organiserName}
                  <span className="font-normal text-[var(--admin-soft)]"> | {s.step === null ? 'a message' : `message ${s.step}`} sent {formatPlatformDateTime(s.sentAt)}</span>
                </p>
                <p className="mt-1 text-xs text-[var(--admin-soft)] [overflow-wrap:anywhere]">To {s.address}</p>
                <form action={logReplyAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="touch" value={s.touchId} />
                  <input type="hidden" name="from" value="today" />
                  <label className="w-full text-xs text-[var(--admin-soft)]">
                    What came back
                    <select name="outcome" required defaultValue="" className="mt-1 block min-h-[44px] w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-paper)] px-3 text-sm text-[var(--admin-ink)]">
                      <option value="" disabled>Choose</option>
                      {OUTCOME_WORDS.map(([v, w]) => (
                        <option key={v} value={v}>{w}</option>
                      ))}
                    </select>
                  </label>
                  <label className="w-full text-xs text-[var(--admin-soft)]">
                    Their words (paste, if you have them)
                    <textarea name="wording" rows={2} maxLength={5000} className="mt-1 block w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-paper)] px-3 py-2 text-sm text-[var(--admin-ink)]" />
                  </label>
                  <button type="submit" className={RECORD}>Record</button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
