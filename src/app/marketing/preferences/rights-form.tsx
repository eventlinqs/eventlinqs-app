'use client'

import { useActionState } from 'react'
import { stopFacilitationByEmailAction } from '@/app/actions/marketing-rights'

/**
 * The stop request, with no account and no token.
 *
 * Every outcome is on screen: pending while it runs, the recorded answer when
 * it lands, and the refusal when it will not. A privacy right that submits into
 * silence is worse than not offering it, because the person walks away
 * believing it was done.
 */
export function MarketingRightsForm() {
  const [state, action, pending] = useActionState(stopFacilitationByEmailAction, null)

  return (
    <form action={action} className="mt-4 space-y-3">
      <label htmlFor="marketing-rights-email" className="block text-sm font-medium text-ink-900">
        Your email address
      </label>
      <input
        id="marketing-rights-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="h-11 w-full rounded-lg border border-ink-300 px-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
        placeholder="you@example.com"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-lg bg-ink-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? 'Recording your request' : 'Stop using my details for other organisers'}
      </button>
      {state && (
        <p
          role="status"
          className={state.ok ? 'text-sm text-ink-700' : 'text-sm text-red-700'}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
