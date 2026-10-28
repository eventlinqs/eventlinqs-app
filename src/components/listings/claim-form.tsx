'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { checkListingClaim, startListingClaim, type ClaimCheckState, type ClaimStartState } from '@/app/actions/listing-claim'
import { claimAuthorityWords } from '@/lib/listings/claim-acceptance'
import { PERMISSION_WORDS } from '@/lib/listings/submission'
import { AddMediaForm, RegularNightsForm } from '@/components/listings/organiser-media-forms'

/**
 * The claim, on one card (WI2-PLAN.md Part 3b), in the project manager's claim page words (C:\dev\START-16OCT\
 * EVENTLINQS-ORGANISER-MESSAGES-28OCT.md, section 6), the claim as acceptance of the engine plan's part D:
 *   1. name and role (and, where the venue publishes no address, an address at its own website's domain), then
 *      "Send my code";
 *   2. "Enter your code" with the two ticks, Lawal's permission line and the claimant's authority to give it, then
 *      "Confirm": the database writes the yes with the move, only on the right code; unticked, it is still claimed;
 *   3. "Add your posters or photos" (optional), "Upload" or "Skip for now";
 *   4. "Your regular nights", each series with "Keep listing these automatically" on by default, "Finish";
 *   5. the done line.
 * Classes are the artist claim page's own (src/app/artists/claim/[token]/page.tsx), so nothing here is new to the
 * design system.
 */
export function ClaimForm(props: {
  kind: 'venue' | 'event'
  slug: string
  hostName: string
  askDomainEmail: boolean
  /** The venue's published address, masked, where the code goes; null where the claimant names one or none exists. */
  codeTo: string | null
  doneHref: string
}) {
  const [started, start, starting] = useActionState<ClaimStartState, FormData>(startListingClaim, null)
  const [checked, check, checking] = useActionState<ClaimCheckState, FormData>(checkListingClaim, null)
  const [again, setAgain] = useState(0)
  const [yesTicked, setYesTicked] = useState(false)
  const [step, setStep] = useState<'photos' | 'nights' | 'done'>('photos')
  const [kept, setKept] = useState<string[] | null>(null)
  const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
  const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'
  const quiet = 'inline-flex h-11 items-center px-2 text-sm font-semibold text-ink-900 underline'

  if (checked?.state === 'verified') {
    const nextAfterPhotos = checked.series.length > 0 ? 'nights' : 'done'
    if (step === 'photos' && checked.nights.length > 0) {
      return (
        <div className="text-left">
          <h2 className="font-display text-xl font-bold text-ink-900">Add your posters or photos</h2>
          <p className="mt-1 text-sm text-ink-600">Optional. Our team checks each one before it is used.</p>
          <div className="mt-4">
            <AddMediaForm
              nights={checked.nights}
              submitLabel="Upload"
              after={
                <button type="button" onClick={() => setStep(nextAfterPhotos)} className={quiet}>
                  Skip for now
                </button>
              }
            />
          </div>
        </div>
      )
    }
    if (step !== 'done' && checked.series.length > 0) {
      return (
        <div className="text-left">
          <h2 className="font-display text-xl font-bold text-ink-900">Your regular nights</h2>
          <RegularNightsForm
            series={checked.series}
            allOn
            finishLabel="Finish"
            onFinish={(names) => {
              setKept(names)
              setStep('done')
            }}
          />
        </div>
      )
    }
    return (
      <div>
        <h2 className="font-display text-xl font-bold text-ink-900">{props.hostName} is yours</h2>
        <p className="mt-2 text-sm text-ink-600">
          {(kept ?? checked.series.filter((s) => s.keep).map((s) => s.name)).length === 0 && checked.series.length > 0
            ? "That's it. Your regular nights are paused, so none will publish until you switch them back on from Your photos and artwork."
            : `That's it. Your ${nightsWords(kept ?? checked.series.filter((s) => s.keep).map((s) => s.name))} will keep publishing, and we'll let you know when one's featured.`}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href={props.doneHref} className={button}>
            Go to your dashboard
          </Link>
          <Link href="/dashboard/organisation/media" className={quiet}>
            Your photos and artwork
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
          Enter your code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={input} />
        </label>
        <label className="mt-4 flex min-h-[44px] items-start gap-3 text-sm text-ink-600">
          <input type="checkbox" name="permission" value="yes" checked={yesTicked} onChange={(e) => setYesTicked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span data-permission-words>{PERMISSION_WORDS}</span>
        </label>
        <label className="flex min-h-[44px] items-start gap-3 text-sm text-ink-600">
          <input type="checkbox" name="authority" value="yes" required={yesTicked} className="mt-0.5 h-5 w-5 shrink-0" />
          <span data-authority-words>{claimAuthorityWords(props.kind)}</span>
        </label>
        {checked?.state === 'refused' ? <p className="mt-2 text-sm text-ink-600">{checked.reason}</p> : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={checking} className={button}>
            Confirm
          </button>
          <button type="button" onClick={() => setAgain(again + 1)} className={quiet}>
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
      {props.codeTo ? <p className="mt-4 text-sm text-ink-600">We&apos;ll send a 6-digit code to {props.codeTo}, the address on your website.</p> : null}
      {started?.state === 'refused' ? <p className="mt-2 text-sm text-ink-600">{started.reason}</p> : null}
      <div className="mt-6">
        <button type="submit" disabled={starting} className={button}>
          Send my code
        </button>
      </div>
    </form>
  )
}

/** "[nights]" in the done line: the names of the series kept listing, or their nights. */
function nightsWords(names: string[]): string {
  if (names.length === 0) return 'nights'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
