import Link from 'next/link'
import { Download, Send } from 'lucide-react'

/**
 * THE FOUR ZEROS.
 *
 * An organiser who publishes and opens their reach panel was shown this:
 *
 *     0            0            0            0
 *     Tickets      Orders       Clicks       Views
 *
 * Four zeros in a row, in the first minute of using the product, on the one
 * screen whose whole job is to prove the platform brings people to their event.
 * Nothing was wrong. Nothing had been shared yet. But a row of zeros does not
 * read as "not yet", it reads as "this does not work", and it is the first
 * thing the organiser sees after the biggest moment they have with us.
 *
 * So at zero the panel stops reporting and starts explaining. It says nothing
 * has travelled yet, says what each of the four measures will mean when it
 * arrives, and offers the one action that makes the first number happen. The
 * moment ANY of the four is non-zero the real tiles come back, because a zero
 * standing next to a number is information and deserves to be shown.
 *
 * The legend is not decoration. It is where the honesty of the panel is set up
 * before there is anything to be honest about: two of these measures are hard
 * and cannot be inflated, two are close estimates, and the organiser is told
 * which is which here rather than discovering it later and doubting all four.
 */

type Measure = {
  label: string
  meaning: string
  /** Hard measures come from a real payment and cannot be forged. */
  hard: boolean
}

const MEASURES: readonly Measure[] = [
  {
    label: 'Tickets sold from links',
    meaning:
      'A ticket issued against a real payment, matched to the exact link that carried the buyer. Nothing can inflate it.',
    hard: true,
  },
  {
    label: 'Orders from links',
    meaning: 'One completed order, counted once per link, however many times it is opened.',
    hard: true,
  },
  {
    label: 'Link clicks',
    meaning:
      'Someone opened your link. Previews from Facebook, WhatsApp and the rest are filtered out and repeat taps count once an hour.',
    hard: false,
  },
  {
    label: 'Link views',
    meaning: 'Your event page loaded from a shared link, counted once per person per day.',
    hard: false,
  },
]

export function ReachEmptyState({
  shareHref,
  posterHref,
}: {
  /** Where "send it everywhere" goes: the share row on this same screen. */
  shareHref: string
  posterHref: string
}) {
  return (
    <div className="px-6 py-6">
      <div className="max-w-2xl">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          Nothing has travelled yet
        </p>
        <h3 className="mt-2 font-display text-xl font-bold leading-snug text-ink-900">
          Your first number lands the moment someone opens one of your links
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Nothing on this panel is estimated into existence and nothing is filled in for you.
          Send a link from the row above, or put your QR poster up where your people already
          are, and these four start filling in against the channel that earned them.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-100 sm:grid-cols-2">
        {MEASURES.map(measure => (
          <div key={measure.label} className="bg-canvas px-5 py-4">
            <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-900">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  measure.hard ? 'bg-gold-500' : 'bg-ink-300'
                }`}
              />
              {measure.label}
              <span className="font-body text-[10px] font-semibold uppercase tracking-normal text-ink-500">
                {measure.hard ? 'Measured' : 'Close estimate'}
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{measure.meaning}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={shareHref}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-600"
        >
          <Send className="h-4 w-4" aria-hidden />
          Send it everywhere
        </Link>
        <a
          href={posterHref}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)]"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download your QR poster
        </a>
      </div>
    </div>
  )
}
