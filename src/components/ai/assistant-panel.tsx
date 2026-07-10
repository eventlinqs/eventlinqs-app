'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Sparkles, LifeBuoy } from 'lucide-react'

/**
 * Shared assistant chat panel. One implementation for every assistant
 * (support, organiser onboarding, buyer onboarding, event helper) so the
 * design system, accessibility, and error handling live in one place.
 *
 * All intelligence is server-side: this component only posts the visible
 * transcript to /api/ai/chat and renders what comes back. No prompt text
 * exists on the client.
 */

export type PanelSuggestion = {
  kind: 'title' | 'description' | 'category'
  value: string
}

type PanelMessage = {
  role: 'user' | 'assistant'
  content: string
  suggestions?: PanelSuggestion[]
}

type AssistantPanelProps = {
  assistant: 'support' | 'organiser-onboarding' | 'buyer-onboarding' | 'event-helper'
  title: string
  intro: string
  placeholder: string
  starters?: string[]
  /** Event helper only: current draft fields sent with each turn. */
  getDraft?: () => { title: string; description: string }
  /** Event helper only: called when the user taps Use this on a suggestion. */
  onApplySuggestion?: (s: PanelSuggestion) => void
  /** Support for guests: show an optional follow-up email field. */
  collectEmail?: boolean
  className?: string
}

const SUGGESTION_LABEL: Record<PanelSuggestion['kind'], string> = {
  title: 'Suggested title',
  description: 'Suggested description',
  category: 'Suggested category',
}

export function AssistantPanel({
  assistant,
  title,
  intro,
  placeholder,
  starters = [],
  getDraft,
  onApplySuggestion,
  collectEmail = false,
  className = '',
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [input, setInput] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handedOff, setHandedOff] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      setError(null)
      const nextMessages: PanelMessage[] = [...messages, { role: 'user', content: trimmed }]
      setMessages(nextMessages)
      setInput('')
      setBusy(true)
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistant,
            messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
            ...(getDraft ? { draft: getDraft() } : {}),
            ...(collectEmail && email ? { userEmail: email } : {}),
          }),
        })
        const data = (await res.json()) as {
          ok: boolean
          reply?: string
          handoff?: boolean
          handoffSent?: boolean
          suggestions?: PanelSuggestion[]
          message?: string
          retryAfterSeconds?: number
        }
        if (res.status === 429) {
          setError(
            `You are sending messages a little quickly. Try again in ${data.retryAfterSeconds ?? 30} seconds.`
          )
          return
        }
        if (!res.ok || !data.ok || !data.reply) {
          setError(data.message ?? 'The assistant could not respond just now. Please try again.')
          return
        }
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.reply!, suggestions: data.suggestions ?? [] },
        ])
        if (data.handoff && data.handoffSent) setHandedOff(true)
      } catch {
        setError('The assistant could not respond just now. Please check your connection and try again.')
      } finally {
        setBusy(false)
      }
    },
    [assistant, busy, collectEmail, email, getDraft, messages]
  )

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white ${className}`}
      aria-label={title}
    >
      <header className="flex items-center gap-3 border-b border-ink-100 bg-ink-900 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-400/15">
          <Sparkles className="h-4 w-4 text-gold-400" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-white/70">{intro}</p>
        </div>
      </header>

      {collectEmail && (
        <div className="border-b border-ink-100 bg-canvas px-5 py-2.5">
          <label className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
            <span>Email for follow-up (optional)</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
            />
          </label>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        style={{ minHeight: '16rem', maxHeight: '26rem' }}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">{intro}</p>
            {starters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {starters.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="min-h-11 rounded-full border border-ink-200 bg-white px-4 py-2 text-left text-xs font-medium text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-ink-900 px-4 py-2.5 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-md border border-ink-100 bg-canvas px-4 py-2.5 text-sm text-ink-900'
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.suggestions && m.suggestions.length > 0 && onApplySuggestion && (
                <div className="mt-3 space-y-2">
                  {m.suggestions.map((s, j) => (
                    <div key={j} className="rounded-lg border border-gold-400/40 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        {SUGGESTION_LABEL[s.kind]}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-ink-900">{s.value}</p>
                      <button
                        type="button"
                        onClick={() => onApplySuggestion(s)}
                        className="mt-2 min-h-11 rounded-md bg-ink-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-800"
                      >
                        Use this
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start" aria-label="Assistant is typing">
            <div className="rounded-2xl rounded-bl-md border border-ink-100 bg-canvas px-4 py-3">
              <span className="flex gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {handedOff && (
          <div className="flex items-start gap-2.5 rounded-lg border border-gold-400/40 bg-gold-100/50 px-4 py-3">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-gold-800" aria-hidden="true" />
            <p className="text-xs text-ink-900">
              This conversation has been passed to our support team. They reply within 1 business
              day, Monday to Friday.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-xs text-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-end gap-2 border-t border-ink-100 px-4 py-3"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder={placeholder}
          rows={1}
          maxLength={2000}
          className="min-h-11 flex-1 resize-none rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
          aria-label="Message the assistant"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
