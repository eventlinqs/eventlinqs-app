'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { checkListingClaim, startListingClaim, type ClaimCheckState, type ClaimStartState } from '@/app/actions/listing-claim'

/**
 * The claim's two steps, on one card (WI2-PLAN.md Part 3b): name and role (and, where the venue publishes no address,
 * an address at its own website's domain), then the 6-digit code from that address. Classes are the artist claim page's
 * own (src/app/artists/claim/[token]/page.tsx), so nothing here is new to the design system.
 */
export function ClaimForm(props: { kind: 'venue' | 'event'; slug: string; hostName: string; askDomainEmail: boolean; doneHref: string }) {
  const [started, start, starting] = useActionState<ClaimStartState, FormData>(startListingClaim, null)
  const [checked, check, checking] = useActionState<ClaimCheckState, FormData>(checkListingClaim, null)
  const [again, setAgain] = useState(0)
  const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
  const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'

  if (checked?.state === 'verified') {
    return (
      <div>
        <h2 className="font-display text-xl font-bold text-ink-900">{props.hostName} is yours</h2>
        <p className="mt-2 text-sm text-ink-600">Your listing now shows as run by you. Edit it from your dashboard.</p>
        <div className="mt-6">
          <Link href={props.doneHref} className={button}>
            Go to your dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (started?.state === 'manual') {
    return (
      <p className="text-sm text-ink-600">
        {props.hostName} does not publish an address we can send a code to, so we will check your claim ourselves and email you within a
        day.
      </p>
    )
  }

  if (started?.state === 'sent' && again === 0) {
    return (
      <form action={check} method="post" className="text-left">
        <input type="hidden" name="claimId" value={started.claimId} />
        <p className="text-sm text-ink-600">We sent a 6-digit code to {started.to}. It works for 15 minutes.</p>
        <label className="mt-4 block text-sm font-medium text-ink-900">
          Code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={input} />
        </label>
        {checked?.state === 'refused' ? <p className="mt-2 text-sm text-ink-600">{checked.reason}</p> : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={checking} className={button}>
            Confirm
          </button>
          <button type="button" onClick={() => setAgain(again + 1)} className="h-11 px-2 text-sm font-semibold text-ink-900 underline">
            Ask for a new code
          </button>
        </div>
      </form>
    )
  }

  return (
    <form method="post" action={(formData) => {
      setAgain(0)
      return start(formData)
    }} className="text-left">
      <input type="hidden" name="kind" value={props.kind} />
      <input type="hidden" name="slug" value={props.slug} />
      <label className="block text-sm font-medium text-ink-900">
        Your name
        <input name="name" maxLength={120} required autoComplete="name" className={input} />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink-900">
        Your role at {props.hostName}
        <input name="role" maxLength={80} required placeholder="Owner, manager, booker" className={input} />
      </label>
      {props.askDomainEmail ? (
        <label className="mt-4 block text-sm font-medium text-ink-900">
          Your email at the venue&apos;s own website
          <input name="email" type="email" autoComplete="email" className={input} />
        </label>
      ) : null}
      {started?.state === 'refused' ? <p className="mt-2 text-sm text-ink-600">{started.reason}</p> : null}
      <div className="mt-6">
        <button type="submit" disabled={starting} className={button}>
          Send me a code
        </button>
      </div>
    </form>
  )
}
