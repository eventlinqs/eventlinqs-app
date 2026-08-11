'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Tells a buyer what happened when checkout sent them away.
 *
 * THE DEFECT. `src/app/checkout/[reservation_id]/page.tsx` redirects to
 * `/events?error=reservation_expired` when a hold runs out, and to
 * `/events?error=reservation_not_found` in three other cases. Nothing anywhere
 * read that parameter: `EventsSearchParams` has no `error` key and no surface
 * rendered one. So a person part-way through paying had their seats released
 * and landed on the national browse list with no message at all, and no way to
 * tell whether they had been logged out, whether the event had gone, or
 * whether they had done something wrong.
 *
 * Silence is the worst possible answer here, because the buyer's own money is
 * mid-flight. They need three things and this gives all three: what happened,
 * that it was not their fault, and the way back.
 */

const NOTICES: Record<string, { title: string; body: string }> = {
  reservation_expired: {
    title: 'Your ticket hold ran out',
    body: 'Tickets are held for a short time so they cannot be double sold. Yours were released before payment finished, so nothing was charged. They may still be available.',
  },
  reservation_not_found: {
    title: 'That checkout is no longer open',
    body: 'The hold was already used, cancelled, or belongs to a different browser session. Nothing was charged. You can pick your tickets again.',
  },
}

export function ReservationNotice({ backHref, backLabel }: { backHref?: string; backLabel?: string }) {
  const params = useSearchParams()
  // `error` is what checkout already writes in four places; `notice` is the
  // clearer name used by the expiry path now that it returns to the event.
  const code = params.get('notice') || params.get('error')
  const notice = code ? NOTICES[code] : undefined
  if (!notice) return null

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-gold-500/40 bg-gold-100/40 px-4 py-4 sm:px-5"
    >
      <p className="text-sm font-semibold text-ink-900">{notice.title}</p>
      <p className="mt-1 text-sm text-ink-700">{notice.body}</p>
      {backHref && (
        <Link
          href={backHref}
          className="mt-3 inline-flex h-11 items-center justify-center rounded-lg bg-ink-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
        >
          {backLabel ?? 'Try again'}
        </Link>
      )}
    </div>
  )
}
