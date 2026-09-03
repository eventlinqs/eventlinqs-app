import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { createAdminClient } from '@/lib/supabase/admin'
import { readStreamLink } from '@/lib/stream/link'
import { classifyStreamLink } from '@/lib/stream/embed'
import { describeCountries } from '@/lib/stream/countries'
import { answerStreamQuestion, setStreamMessageHidden, postOrganiserMessage } from './stream-actions'

export const metadata: Metadata = {
  title: 'Stream room | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ done?: string; error?: string }>
}

/** The sentence for each outcome an action can carry back on the address. */
const DONE_COPY: Record<string, string> = {
  answered: 'Your answer is in the room. Every viewer sees it under the question.',
  hidden: 'Hidden. It vanishes from every viewer within a few seconds.',
  shown: 'Shown again.',
  posted: 'Posted to the room.',
}
const ERROR_COPY: Record<string, string> = {
  not_signed_in: 'You are not signed in.',
  not_yours: 'You do not manage this event.',
  which_question: 'Which question? Try again from the list.',
  answer_length: 'Write an answer of up to 1000 characters.',
  not_in_room: 'That message is not in this room.',
  save_failed: 'That could not be saved. Try again.',
  which_message: 'Which message? Try again from the list.',
  post_length: 'Write between 1 and 500 characters.',
}

type RoomRow = {
  id: string
  author_kind: string
  author_name: string
  kind: string
  body: string
  answer_body: string | null
  answered_at: string | null
  hidden_at: string | null
  created_at: string
}

function when(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone ?? undefined,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/*
 * THE ORGANISER'S ROOM (Scope v5, 3.11). getOrganiserEvent is the ownership
 * gate every event subpage uses; nothing below runs without it. The stream
 * link is read from the vault with the service role AFTER that gate, which is
 * the allowed shape (scripts/guards/stream-link-never-public.mjs).
 */
export default async function StreamRoomPage({ params, searchParams }: Props) {
  const { id } = await params
  const { done, error: errorCode } = await searchParams
  const event = await getOrganiserEvent(id)
  if (!event) notFound()
  const doneCopy = done ? DONE_COPY[done] : null
  const errorCopy = errorCode ? (ERROR_COPY[errorCode] ?? ERROR_COPY.save_failed) : null

  const admin = createAdminClient()
  const [{ data: row }, link, { data: tiers }, { data: messages }] = await Promise.all([
    admin.from('events').select('event_type, stream_geo_allow').eq('id', id).maybeSingle(),
    readStreamLink(admin, id),
    admin.from('ticket_tiers').select('id, name, access_mode, sold_count, total_capacity').eq('event_id', id).order('sort_order'),
    admin
      .from('stream_messages')
      .select('id, author_kind, author_name, kind, body, answer_body, answered_at, hidden_at, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
  ])

  const eventType = (row?.event_type ?? 'in_person') as 'in_person' | 'virtual' | 'hybrid'
  const geo = (row?.stream_geo_allow ?? []) as string[]
  const classified = classifyStreamLink(link)
  const livestreamTiers = (tiers ?? []).filter(t => eventType === 'virtual' || t.access_mode === 'virtual')
  const livestreamSold = livestreamTiers.reduce((s, t) => s + (t.sold_count ?? 0), 0)
  const all = (messages ?? []) as RoomRow[]
  const questions = all.filter(m => m.kind === 'question')
  const chat = all.filter(m => m.kind === 'chat')
  const reactionCount = all.filter(m => m.kind === 'reaction' && !m.hidden_at).length
  const unanswered = questions.filter(q => !q.answer_body && !q.hidden_at).length

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/events/${id}`} className="text-sm text-ink-600 hover:text-ink-900">
          ← Back to event
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Stream room</h1>
        <span className="text-sm text-ink-400">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      {doneCopy && (
        <p role="status" className="mb-4 rounded-lg border border-gold-500/40 bg-gold-100/60 px-4 py-3 text-sm text-ink-900">
          {doneCopy}
        </p>
      )}
      {errorCopy && (
        <p role="alert" className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-ink-900">
          {errorCopy}
        </p>
      )}

      {eventType === 'in_person' ? (
        <div className="rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="text-base font-semibold text-ink-900">This event is in person only</h2>
          <p className="mt-2 text-sm text-ink-600">
            Set the event type to Virtual or Hybrid on the location step to add a stream link and open a room for
            livestream ticket holders.
          </p>
          <Link href={`/dashboard/events/${id}/edit`} className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-gold-800 underline hover:text-gold-700">
            Edit the event
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-ink-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-ink-600">Stream link</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">{classified.ok ? classified.label : 'Not added yet'}</p>
              <p className="mt-1 text-xs text-ink-600">
                {classified.ok
                  ? 'Revealed to livestream ticket holders on their ticket and in their email.'
                  : 'Add it on the location step. Livestream tickets cannot go live without it.'}
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-ink-600">Who can watch</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">{geo.length > 0 ? describeCountries(geo) : 'Anywhere'}</p>
              <p className="mt-1 text-xs text-ink-600">Checked against the viewer&apos;s country on every visit.</p>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-ink-600">Livestream tickets</p>
              <p className="mt-1 text-2xl font-bold text-ink-900">{livestreamSold.toLocaleString('en-AU')}</p>
              <p className="mt-1 text-xs text-ink-600">
                {livestreamTiers.length === 1 ? '1 livestream tier' : `${livestreamTiers.length} livestream tiers`} · {reactionCount} reactions · {unanswered} unanswered
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="questions-heading" className="rounded-xl border border-ink-200 bg-white p-5">
              <h2 id="questions-heading" className="text-base font-semibold text-ink-900">Questions</h2>
              <p className="mt-1 text-xs text-ink-600">Your answer appears under the question in every viewer&apos;s room.</p>
              {questions.length === 0 && <p className="mt-4 text-sm text-ink-600">No questions yet.</p>}
              {/* A hidden message is marked by a dashed border and the word, never by fading
                * the row: opacity took the Hide and Show again controls below 4.5:1 and axe
                * failed the tab for it (4 September 2026). Every shade here is a token in
                * globals.css; ink-50, ink-300, ink-500 and ink-700 are not, and compile to
                * nothing. */}
              <ul className="mt-4 space-y-4">
                {questions.map(q => (
                  <li key={q.id} className={`rounded-lg border p-4 ${q.hidden_at ? 'border-dashed border-ink-400 bg-ink-100' : 'border-ink-200 bg-canvas'}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                      {q.author_name} · {when(q.created_at, event.timezone)}
                      {q.hidden_at ? ' · hidden' : ''}
                    </p>
                    <p className="mt-1 text-sm text-ink-900">{q.body}</p>
                    {q.answer_body ? (
                      <div className="mt-3 rounded-lg border border-gold-500/40 bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-800">Your answer</p>
                        <p className="mt-0.5 text-sm text-ink-900">{q.answer_body}</p>
                      </div>
                    ) : (
                      <form action={answerStreamQuestion} className="mt-3">
                        <input type="hidden" name="event_id" value={id} />
                        <input type="hidden" name="message_id" value={q.id} />
                        <label htmlFor={`answer-${q.id}`} className="block text-xs font-medium text-ink-600">Your answer</label>
                        <textarea
                          id={`answer-${q.id}`}
                          name="answer"
                          rows={2}
                          maxLength={1000}
                          required
                          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                        />
                        <button type="submit" className="mt-2 min-h-[44px] rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink-900 hover:bg-gold-600">
                          Answer
                        </button>
                      </form>
                    )}
                    <form action={setStreamMessageHidden} className="mt-2">
                      <input type="hidden" name="event_id" value={id} />
                      <input type="hidden" name="message_id" value={q.id} />
                      <input type="hidden" name="hidden" value={q.hidden_at ? '0' : '1'} />
                      <button type="submit" className="min-h-[44px] text-xs font-medium text-ink-600 underline hover:text-ink-900">
                        {q.hidden_at ? 'Show again' : 'Hide'}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="chat-heading" className="rounded-xl border border-ink-200 bg-white p-5">
              <h2 id="chat-heading" className="text-base font-semibold text-ink-900">Chat</h2>
              <p className="mt-1 text-xs text-ink-600">Hide anything that should not be there. Hidden messages vanish from every room within seconds.</p>
              <form action={postOrganiserMessage} className="mt-4 rounded-lg border border-gold-500/40 bg-gold-100/40 p-4">
                <input type="hidden" name="event_id" value={id} />
                <input type="hidden" name="author_name" value={event.organisationName} />
                <label htmlFor="organiser-post" className="block text-xs font-medium text-ink-600">Post as {event.organisationName}</label>
                <textarea
                  id="organiser-post"
                  name="body"
                  rows={2}
                  maxLength={500}
                  required
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
                <button type="submit" className="mt-2 min-h-[44px] rounded-full bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-navy-900)]">
                  Post to the room
                </button>
              </form>
              {chat.length === 0 && <p className="mt-4 text-sm text-ink-600">Nobody has said anything yet.</p>}
              <ul className="mt-4 space-y-3">
                {chat.map(m => (
                  <li key={m.id} className={`rounded-lg px-3 py-2 ${m.hidden_at ? 'border border-dashed border-ink-400 bg-ink-100' : m.author_kind === 'organiser' ? 'border border-gold-500/40 bg-gold-100/40' : 'bg-canvas'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                          {m.author_kind === 'organiser' ? `${m.author_name} (you)` : m.author_name} · {when(m.created_at, event.timezone)}
                          {m.hidden_at ? ' · hidden' : ''}
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-sm text-ink-900">{m.body}</p>
                      </div>
                      <form action={setStreamMessageHidden}>
                        <input type="hidden" name="event_id" value={id} />
                        <input type="hidden" name="message_id" value={m.id} />
                        <input type="hidden" name="hidden" value={m.hidden_at ? '0' : '1'} />
                        <button type="submit" className="min-h-[44px] shrink-0 text-xs font-medium text-ink-600 underline hover:text-ink-900">
                          {m.hidden_at ? 'Show again' : 'Hide'}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
