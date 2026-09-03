'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * THE ROOM (Scope v5, 3.11): chat, questions and reactions for a livestream
 * ticket holder, behind the same bearer pair as the ticket.
 *
 * WHY POLLING AND NOT REALTIME. A livestream ticket holder has no Supabase
 * session, only the (code, secret) pair, so Realtime row-level security could
 * not name them and a channel would either be open to the world or closed to
 * them. Every read and write here goes through /api/stream/[code]/messages,
 * which verifies the pair, the tier, the ticket status and the viewer's
 * country on every call. A five second poll of the last 200 visible messages
 * is honest about that: it also means a message the organiser hides vanishes
 * for everybody on the next tick, because the list is replaced, not appended.
 *
 * Light canvas, navy and gold, solid surfaces, 44px controls, no exclamation
 * marks, Australian English (Design system, Copy).
 */
type RoomMessage = {
  id: string
  kind: 'chat' | 'question'
  authorKind: 'attendee' | 'organiser'
  authorName: string
  body: string
  answerBody: string | null
  answeredAt: string | null
  createdAt: string
  mine: boolean
}

type RoomPayload = {
  ok: true
  now: string
  messages: RoomMessage[]
  reactions: Record<string, number>
}

const REACTIONS: { key: string; label: string; glyph: string }[] = [
  { key: 'fire', label: 'Fire', glyph: '🔥' },
  { key: 'heart', label: 'Love it', glyph: '❤️' },
  { key: 'clap', label: 'Applause', glyph: '👏' },
  { key: 'laugh', label: 'Laughing', glyph: '😂' },
]

const POLL_MS = 5000
const MAX_BODY = 500

function timeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function StreamRoom({ code, secret, holderName }: { code: string; secret: string; holderName: string }) {
  const endpoint = `/api/stream/${encodeURIComponent(code)}/messages?k=${encodeURIComponent(secret)}`
  const [tab, setTab] = useState<'chat' | 'questions'>('chat')
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [reactions, setReactions] = useState<Record<string, number>>({})
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' })
      if (!res.ok) {
        setError(res.status === 403 ? 'This room is no longer open to your ticket.' : 'The room could not be reached. It will try again shortly.')
        return
      }
      const data = (await res.json()) as RoomPayload
      setMessages(data.messages)
      setReactions(data.reactions)
      setError(null)
      setLoaded(true)
    } catch (err) {
      // A dropped poll is not an incident; the next tick retries. It is named
      // so the sentence below can be shown rather than nothing.
      setError(`The room could not be reached (${err instanceof Error ? err.message : 'network'}). It will try again shortly.`)
    }
  }, [endpoint])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, tab])

  async function post(kind: 'chat' | 'question' | 'reaction', body: string) {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, body }),
      })
      if (res.status === 429) {
        setError('You are posting quickly. Wait a moment and try again.')
        return false
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null
        setError(payload?.message ?? 'That could not be posted.')
        return false
      }
      await refresh()
      return true
    } catch (err) {
      setError(`That could not be posted (${err instanceof Error ? err.message : 'network'}).`)
      return false
    } finally {
      setSending(false)
    }
  }

  async function submitDraft() {
    const body = draft.trim()
    if (!body) return
    const ok = await post(tab === 'chat' ? 'chat' : 'question', body.slice(0, MAX_BODY))
    if (ok) setDraft('')
  }

  const visible = messages.filter(m => (tab === 'chat' ? m.kind === 'chat' : m.kind === 'question'))
  const questionCount = messages.filter(m => m.kind === 'question').length

  return (
    <section aria-label="Livestream room" className="flex h-full min-h-[520px] flex-col rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-200 px-4 pt-4">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">The room</p>
        <div role="tablist" aria-label="Room sections" className="mt-2 flex gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            onClick={() => setTab('chat')}
            className={`min-h-[44px] rounded-t-lg px-4 text-sm font-semibold ${
              tab === 'chat' ? 'border-b-2 border-gold-500 text-ink-900' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'questions'}
            onClick={() => setTab('questions')}
            className={`min-h-[44px] rounded-t-lg px-4 text-sm font-semibold ${
              tab === 'questions' ? 'border-b-2 border-gold-500 text-ink-900' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            Questions{questionCount > 0 ? ` (${questionCount})` : ''}
          </button>
        </div>
      </div>

      <div ref={listRef} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!loaded && <p className="text-sm text-ink-500">Opening the room.</p>}
        {loaded && visible.length === 0 && (
          <p className="text-sm text-ink-500">
            {tab === 'chat' ? 'Nobody has said anything yet. Say hello.' : 'No questions yet. Ask the organiser something.'}
          </p>
        )}
        {visible.map(m => (
          <div
            key={m.id}
            className={`rounded-xl px-3 py-2 ${
              m.authorKind === 'organiser'
                ? 'border border-gold-500/40 bg-gold-100/40'
                : m.mine
                  ? 'bg-ink-100'
                  : 'bg-canvas'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {m.authorKind === 'organiser' ? `${m.authorName} (organiser)` : m.mine ? 'You' : m.authorName}
              <span className="ml-2 font-normal normal-case tracking-normal text-ink-400">{timeLabel(m.createdAt)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-ink-900">{m.body}</p>
            {m.kind === 'question' && m.answerBody && (
              <div className="mt-2 rounded-lg border border-gold-500/40 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-800">Answer from the organiser</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-ink-900">{m.answerBody}</p>
              </div>
            )}
            {m.kind === 'question' && !m.answerBody && (
              <p className="mt-1 text-[11px] text-ink-500">Waiting for the organiser.</p>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-ink-200 px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Reactions">
          {REACTIONS.map(r => (
            <button
              key={r.key}
              type="button"
              aria-label={`React with ${r.label}`}
              disabled={sending}
              onClick={() => {
                void post('reaction', r.key)
              }}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-ink-200 bg-white px-3 text-sm hover:border-gold-500 disabled:opacity-60"
            >
              <span aria-hidden>{r.glyph}</span>
              <span className="text-xs font-semibold text-ink-700">{reactions[r.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <label htmlFor="stream-room-draft" className="block text-xs font-medium text-ink-600">
          {tab === 'chat' ? 'Say something' : 'Ask a question'}
        </label>
        <textarea
          id="stream-room-draft"
          value={draft}
          maxLength={MAX_BODY}
          rows={2}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submitDraft()
            }
          }}
          placeholder={tab === 'chat' ? `Posting as ${holderName}` : 'The organiser answers questions in this tab'}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-500">{draft.length} of {MAX_BODY}</p>
          <button
            type="button"
            onClick={() => {
              void submitDraft()
            }}
            disabled={sending || draft.trim().length === 0}
            className="min-h-[44px] rounded-full bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-navy-900)] disabled:opacity-50"
          >
            {tab === 'chat' ? 'Send' : 'Ask'}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-error-strong">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
