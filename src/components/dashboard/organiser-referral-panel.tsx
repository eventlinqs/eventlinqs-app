'use client'

import { useState } from 'react'
import { Check, Copy, UserPlus } from 'lucide-react'

/**
 * AN ORGANISER'S OWN LINK, ON THEIR OWN DASHBOARD.
 *
 * Close-out PL1, the fourth loop. Every organiser who publishes has friends who
 * run events, and nobody has ever asked them. This is the asking: one link,
 * theirs, that credits them on the account it creates.
 *
 * IT IS A PANEL AND NOT A CAMPAIGN. One sentence, the link, and a copy button.
 * No share sheet, no preset message, no reward promised: there is no referral
 * scheme on this platform and inventing the appearance of one on a dashboard
 * would be a claim the product cannot keep. What it says is exactly what is
 * true: the account they bring is recorded as theirs.
 *
 * THE LINK IS BUILT ON THE SERVER and handed down, because it carries a code
 * derived from their profile id and building it in the browser would mean
 * shipping the encoder and the id to every dashboard. A null link renders as an
 * explanation rather than as a link to nowhere: a referral link that quietly
 * drops the code credits nobody and looks identical to one that works.
 */
export function OrganiserReferralPanel({ link }: { link: string | null }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore: the link is on screen and can be selected by hand
    }
  }

  return (
    <section
      data-loop="organiser-referral"
      className="rounded-xl border border-ink-200 bg-white p-5"
      aria-labelledby="organiser-referral-heading"
    >
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-gold-800" aria-hidden />
        <h2 id="organiser-referral-heading" className="text-sm font-semibold text-ink-900">
          Know someone who runs events?
        </h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-600">
        Send them your link. Any account that signs up through it is recorded as yours.
      </p>

      {link ? (
        <>
          <p className="mt-3 truncate rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700">
            {link}
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:border-gold-500"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            <span>{copied ? 'Copied' : 'Copy your link'}</span>
          </button>
        </>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Your link is not ready yet. It appears once your account finishes setting up.
        </p>
      )}
    </section>
  )
}
