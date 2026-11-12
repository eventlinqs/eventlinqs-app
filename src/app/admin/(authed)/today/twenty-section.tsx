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
    <section id="twenty" data-section="twenty" aria-label="Tomorrow's twenty" className="mb-8 scroll-mt-24 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-white">Tomorrow&apos;s twenty</h2>
      {!view.ok ? (
        <p className="mt-2 text-sm text-amber-200">The twenty could not be read just now ({view.why}). Nothing is lost.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/60">
            {view.v.total} organisers, Melbourne first, {view.v.drafted} with a draft ready. Copy each, send it from your own mail, then press Sent.
          </p>
          {view.v.groups.map((g) => (
            <div key={g.key} data-group={g.key} className="mt-5">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white/60">
                {g.words}{g.short > 0 ? `, ${g.short} short today` : ''}
              </h3>
              {g.rows.length === 0 ? (
                <p className="mt-2 text-sm text-white/60">No one in this group today.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/[0.06]">
                  {g.rows.map(({ action: a, contact, draft }) => {
                    const why = draft ? notReady(draft) : []
                    const href = draft ? openInApp(draft.channel, draft.address, draft.subject) : null
                    return (
                      <li key={a.organiserId} data-twenty={a.organiserId} className="py-4">
                        <p className="text-sm font-semibold text-white">
                          {a.organiserName}
                          <span className="font-normal text-white/60">{a.city ? ` | ${a.city.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}` : ''} | {a.why}</span>
                        </p>
                        <p className="mt-1 text-xs text-white/60 [overflow-wrap:anywhere]">
                          To {a.address} ({a.channel}).{' '}
                          {contact
                            ? `Basis: ${BASIS_WORDS[contact.basis] ?? contact.basis}${contact.basisRecordedAt ? `, recorded ${formatPlatformDateTime(contact.basisRecordedAt)}` : ''}.`
                            : 'Basis: not read.'}
                        </p>
                        {contact?.publishedOn ? (
                          <p className="mt-1 text-xs text-white/60 [overflow-wrap:anywhere]">
                            Published at <a href={contact.publishedOn} className="underline underline-offset-2" rel="noreferrer noopener" target="_blank">{contact.publishedOn}</a>
                          </p>
                        ) : null}
                        {draft ? (
                          <>
                            <p className="mt-2 text-xs text-white/60">{stepWords(draft)}{draft.subject ? ` | Subject: ${draft.subject}` : ''}</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80 [overflow-wrap:anywhere]">{draft.body}</p>
                            {why.length > 0 || href === null || !policyVersion ? (
                              <p className="mt-3 text-sm text-white">Not ready: {[...why, ...(policyVersion ? [] : ['the voice policy could not be read'])].join('; ') || 'no way to open it'}.</p>
                            ) : (
                              <>
                                <DailyQueueItem touchId={draft.touchId} contentHash={draft.contentHash} policyVersion={policyVersion} body={draft.body} openHref={href} openLabel={OPEN_LABEL[draft.channel]} action={markSentAction} from="today" />
                                <p className="mt-2 text-xs text-white/50">{nextStepWords(draft.step)}</p>
                              </>
                            )}
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-white/70">No draft yet.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
          {view.v.socialFirstTouches.length > 0 ? (
            <p className="mt-5 text-xs text-white/60">
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
    <section id="sent-recently" data-section="sent-recently" aria-label="Sent, waiting for an answer" className="mb-8 scroll-mt-24 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-white">Sent, waiting for an answer</h2>
      {!view.ok ? (
        <p className="mt-2 text-sm text-amber-200">The messages sent could not be read just now ({view.why}). Nothing is lost.</p>
      ) : view.v.length === 0 ? (
        <p className="mt-2 text-sm text-white/60">Nothing sent in the last {SENT_RECENT_DAYS} days is waiting for an answer.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/60">When a reply, a stop or a bounce comes in, record it here and its follow ups stop.</p>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {view.v.map((s) => (
              <li key={s.touchId} data-sent={s.touchId} className="py-4">
                <p className="text-sm font-semibold text-white">
                  {s.organiserName}
                  <span className="font-normal text-white/60"> | {s.step === null ? 'a message' : `message ${s.step}`} sent {formatPlatformDateTime(s.sentAt)}</span>
                </p>
                <p className="mt-1 text-xs text-white/60 [overflow-wrap:anywhere]">To {s.address}</p>
                <form action={logReplyAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="touch" value={s.touchId} />
                  <input type="hidden" name="from" value="today" />
                  <label className="w-full text-xs text-white/60">
                    What came back
                    <select name="outcome" required defaultValue="" className="mt-1 block min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0A1628] px-3 text-sm text-white">
                      <option value="" disabled>Choose</option>
                      {OUTCOME_WORDS.map(([v, w]) => (
                        <option key={v} value={v}>{w}</option>
                      ))}
                    </select>
                  </label>
                  <label className="w-full text-xs text-white/60">
                    Their words (paste, if you have them)
                    <textarea name="wording" rows={2} maxLength={5000} className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0A1628] px-3 py-2 text-sm text-white" />
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
