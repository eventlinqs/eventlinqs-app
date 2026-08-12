'use client'

import { useState, useTransition } from 'react'
import { Reveal } from '@/components/ui/reveal'
import { emailKitToSelf } from '@/app/launch/actions'

/**
 * The bookmarkable kit link (founder ruling 0.2c, 9 August 2026: a link, 30
 * days, no account).
 *
 * This is also the second, weaker, UNIVERSAL spread vector. It fires for every
 * arrival including the ones THE BILL cannot reach, because every event has at
 * least one other person involved: a person building a kit at eleven at night
 * sends it to a co-organiser to look at, and that person opens a finished kit
 * with a control on it to make their own. Honest assessment: weak per
 * instance, but it costs nothing because the link exists anyway.
 *
 * Email-to-self is offered here, never required. It is a second acquisition
 * surface (the founder's words) and it is cheap: one field, one existing
 * transactional send, no new table.
 */

export function KitLinkBar({ code, ephemeral }: { code: string | null; ephemeral: boolean }) {
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [sendState, setSendState] = useState<{ ok: boolean; message: string } | null>(null)
  const [sending, startSending] = useTransition()

  // No code means the draft store is unavailable (Redis is not configured in
  // this environment, or the hourly cap was reached). The kit on screen is
  // complete and correct; only the shareable link is missing. That is the
  // smallest possible penalty and it does not need an apology.
  if (!code) {
    return (
      <Reveal>
        <div className="mt-10 rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-600">
            {ephemeral
              ? 'Your kit is ready on this screen. Save it to keep a link you can come back to.'
              : 'Your kit is ready on this screen.'}
          </p>
        </div>
      </Reveal>
    )
  }

  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/launch/k/${code}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A clipboard refusal is not an error worth showing: the link is on
      // screen and selectable.
      setCopied(false)
    }
  }

  return (
    <Reveal>
      <div className="mt-10 rounded-xl border border-ink-200 bg-white p-5">
        <h3 className="font-headline text-base font-semibold text-ink-900">
          Your kit lives here
        </h3>
        <p className="mt-2 text-sm text-ink-600">
          Bookmark this, or send it to whoever is helping you run it. It keeps
          working for thirty days.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-ink-50 px-3 py-2 font-mono text-sm text-ink-800">
            /launch/k/{code}
          </code>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink-300 px-5 text-sm font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>

        {/*
          Offered, never required (founder ruling 0.2c). It sits BELOW the link
          that already works, so nothing here reads as a gate: the kit is
          already theirs and this is one more way to keep it.
        */}
        {/*
          method="post" is not decoration. This handler runs only once React is
          live; before that a native submit on a form with no action and no
          method is a GET to the current URL, which would put the organiser's
          email address in the query string of /launch/k/[code] and from there
          into server logs and the referrer header. POST puts the field in the
          body instead. Hydrated behaviour is unchanged, because preventDefault
          still runs. See scripts/guards/no-native-submit-guard.mjs.
        */}
        <form
          method="post"
          className="mt-5 border-t border-ink-200 pt-5"
          onSubmit={e => {
            e.preventDefault()
            startSending(async () => setSendState(await emailKitToSelf(email)))
          }}
        >
          <label htmlFor="kit-email" className="block text-sm font-medium text-ink-900">
            Want it in your inbox as well?
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              id="kit-email"
              name="kit-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-ink-300 px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
            <button
              type="submit"
              disabled={sending || email.trim().length === 0}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink-300 px-5 text-sm font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending' : 'Send it to me'}
            </button>
          </div>
          {sendState ? (
            <p
              role="status"
              className={`mt-3 text-sm ${sendState.ok ? 'text-ink-700' : 'text-ink-600'}`}
            >
              {sendState.message}
            </p>
          ) : null}
        </form>
      </div>
    </Reveal>
  )
}
