'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Send, Sparkles } from 'lucide-react'
import type { GuidanceSurface } from '@/lib/guidance/registry'

/**
 * Ask in context: the question is asked on the surface and answered on the
 * surface, by the platform's locked assistant, with the written guide attached.
 *
 * The thing a static help centre cannot do. The person does not leave the seat
 * map or the studio, does not search a knowledge base, and does not guess which
 * article covers their problem.
 *
 * Two rules make it trustworthy:
 * 1. The assistant id is chosen by the surface, never by the client, and the
 *    system prompt lives server-side in src/lib/ai/assistants.ts. Nothing here
 *    can send prompt text.
 * 2. The guide link under the answer is DETERMINISTIC: it comes from the
 *    guidance registry for this surface, not from the model. A link in this UI
 *    can therefore never be hallucinated, which is the usual failure mode of
 *    an assistant that cites documentation.
 *
 * When the assistant layer is not configured on a deploy, this degrades to the
 * written guides rather than showing a control that would fail.
 */
export function AskInContext({ surface }: { surface: GuidanceSurface }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/ai/status')
      .then(r => r.json())
      .then((d: { enabled?: boolean }) => {
        if (alive) setEnabled(Boolean(d.enabled))
      })
      .catch(() => {
        if (alive) setEnabled(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      setBusy(true)
      setError(null)
      setAnswer(null)
      setQuestion(trimmed)
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistant: surface.assistant,
            messages: [{ role: 'user', content: trimmed }],
          }),
        })
        const data = (await res.json()) as {
          ok?: boolean
          reply?: string
          message?: string
          retryAfterSeconds?: number
        }
        if (res.status === 429) {
          setError(`That was quick. Try again in ${data.retryAfterSeconds ?? 30} seconds.`)
          return
        }
        if (res.status === 401) {
          setError('Sign in to ask about this screen. The written guide below covers it too.')
          return
        }
        if (!res.ok || !data.ok || !data.reply) {
          setError(data.message ?? 'No answer just now. The written guide below covers this.')
          return
        }
        setAnswer(data.reply)
      } catch {
        setError('No answer just now. The written guide below covers this.')
      } finally {
        setBusy(false)
      }
    },
    [busy, surface.assistant],
  )

  const guideLinks = [
    { slug: surface.guideSlug, title: surface.guideTitle },
    ...surface.moreGuides,
  ]

  return (
    <div className="border-t border-ink-100 pt-3">
      {enabled === true && (
        <>
          <p className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Ask about this screen
          </p>

          <form
            onSubmit={e => {
              e.preventDefault()
              void ask(question)
            }}
            className="mt-2 flex items-center gap-1.5"
          >
            <label htmlFor="guidance-ask" className="sr-only">
              Ask a question about {surface.label}
            </label>
            <input
              id="guidance-ask"
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              maxLength={2000}
              placeholder="Type your question"
              className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              aria-label="Send the question"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>

          {!answer && !busy && !error && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {surface.starters.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div aria-live="polite">
            {busy && (
              <p className="mt-2 text-xs text-ink-400">Thinking about that.</p>
            )}
            {answer && (
              <div className="mt-2 rounded-xl border border-ink-100 bg-canvas px-3 py-2.5">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-900">{answer}</p>
              </div>
            )}
            {error && (
              <p className="mt-2 rounded-xl border border-ink-200 bg-canvas px-3 py-2 text-xs text-ink-600">
                {error}
              </p>
            )}
          </div>
        </>
      )}

      {enabled === false && (
        <p className="text-xs leading-relaxed text-ink-600">
          The written guides below cover this screen step by step.
        </p>
      )}

      {/* The guide links are always here, whatever the assistant is doing.
          Deterministic, from the registry: never a link the model invented. */}
      <div className="mt-3">
        <p className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-ink-400">
          <BookOpen className="h-3 w-3" aria-hidden="true" />
          Read the guide
        </p>
        <ul className="mt-1.5 space-y-1">
          {guideLinks.map(g => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900 transition-colors hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                {g.title}
                <ArrowRight className="h-3 w-3 text-gold-800" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
