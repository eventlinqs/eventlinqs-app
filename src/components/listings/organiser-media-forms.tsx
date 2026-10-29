'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { addMedia, giveYes, keepSeries, replaceMedia, withdrawMedia, withdrawYes, type MediaState } from '@/app/actions/organiser-media'
import { claimAuthorityWords } from '@/lib/listings/claim-acceptance'
import { PERMISSION_WORDS } from '@/lib/listings/submission'

/**
 * The organiser's own image forms, on /dashboard/organisation/media and the claim page's upload step, each showing the
 * database's answer in its own words. Classes are the claim form's own (src/components/listings/claim-form.tsx), so
 * nothing here is new to the design system.
 */

const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
const file = 'mt-1 block w-full text-sm text-ink-600 file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-ink-100 file:px-4 file:text-sm file:font-semibold file:text-ink-900'
const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'
const quiet = 'inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60'

function Answer({ state, done }: { state: MediaState; done: string }) {
  if (!state) return null
  return (
    <p role="status" className="mt-2 text-sm text-ink-600">
      {state.state === 'done' ? done : state.reason}
    </p>
  )
}

export function AddMediaForm({
  nights,
  submitLabel = 'Add image',
  after,
  inClaim = false,
}: {
  nights: { id: string; label: string }[]
  submitLabel?: string
  /** Beside the submit button, such as the claim page's "Skip for now". */
  after?: ReactNode
  /** On the claim card: the action refreshes no page, so the card's next steps stay (src/app/actions/organiser-media.ts). */
  inClaim?: boolean
}) {
  const [state, action, pending] = useActionState<MediaState, FormData>(addMedia, null)
  return (
    <form action={action} className="text-left">
      {inClaim ? <input type="hidden" name="flow" value="claim" /> : null}
      <label className="block text-sm font-medium text-ink-900">
        Night
        <select name="eventId" required className={input} defaultValue="">
          <option value="" disabled>
            Choose one of your nights
          </option>
          {nights.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm font-medium text-ink-900">
        Photo or artwork (JPEG, PNG, WebP, AVIF or HEIC, under 10MB)
        <input type="file" name="file" accept="image/*" required className={file} />
      </label>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink-900">It is</legend>
        <div className="mt-1 flex flex-wrap gap-6">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink-600">
            <input type="radio" name="kind" value="photo" defaultChecked className="h-5 w-5" />a photo
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink-600">
            <input type="radio" name="kind" value="artwork" className="h-5 w-5" />
            artwork or a poster
          </label>
        </div>
      </fieldset>
      <label className="mt-4 block text-sm font-medium text-ink-900">
        Credit to show (optional)
        <input name="attribution" maxLength={200} placeholder="Photo: your name or the photographer's" className={input} />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink-900">
        Anything we must not do with it (optional)
        <input name="restrictions" maxLength={500} placeholder="For example, no cropping of the performer" className={input} />
      </label>
      <Answer state={state} done="Added. Our team checks each image before it is used." />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          {submitLabel}
        </button>
        {after}
      </div>
    </form>
  )
}

export function ReplaceMediaForm({ assetId }: { assetId: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(replaceMedia, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="assetId" value={assetId} />
      <label className="block text-sm font-medium text-ink-900">
        Replace with
        <input type="file" name="file" accept="image/*" required className={file} />
      </label>
      <Answer state={state} done="Replaced. The new image is checked before it is used." />
      <div className="mt-3">
        <button type="submit" disabled={pending} className={quiet}>
          Replace
        </button>
      </div>
    </form>
  )
}

export function WithdrawMediaForm({ assetId }: { assetId: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(withdrawMedia, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="assetId" value={assetId} />
      <label className="block text-sm font-medium text-ink-900">
        Why are you withdrawing it?
        <input name="reason" required minLength={3} maxLength={500} className={input} />
      </label>
      <Answer state={state} done="Withdrawn. It comes out of every post not yet published within the hour." />
      <div className="mt-3">
        <button type="submit" disabled={pending} className={quiet}>
          Withdraw this image
        </button>
      </div>
    </form>
  )
}

export function WithdrawYesForm({ permissionId }: { permissionId: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(withdrawYes, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="permissionId" value={permissionId} />
      <label className="block text-sm font-medium text-ink-900">
        Why are you withdrawing your permission?
        <input name="reason" required minLength={3} maxLength={500} className={input} />
      </label>
      <Answer state={state} done="Withdrawn. Every image under it comes out of every post not yet published within the hour. Your listings stay up." />
      <div className="mt-3">
        <button type="submit" disabled={pending} className={quiet}>
          Withdraw my permission
        </button>
      </div>
    </form>
  )
}

/**
 * "Your regular nights": each series with "Keep listing these automatically". On the claim page every box starts on
 * (allOn, the claim page's "on by default"); on the dashboard each starts as the series is now. Only a changed box is
 * saved, through the database's own check that the series is theirs.
 */
export function RegularNightsForm(props: {
  series: { id: string; name: string; keep: boolean }[]
  allOn?: boolean
  finishLabel: string
  onFinish?: (kept: string[]) => void
  /** On the claim card: the action refreshes no page, so the card's done step stays. */
  inClaim?: boolean
}) {
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(props.series.map((s) => [s.id, s.keep])))
  const [keep, setKeep] = useState<Record<string, boolean>>(() => Object.fromEntries(props.series.map((s) => [s.id, props.allOn ? true : s.keep])))
  const [saving, setSaving] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  async function finish() {
    setSaving(true)
    setSaid(null)
    const now = { ...saved }
    for (const s of props.series) {
      if (keep[s.id] === now[s.id]) continue
      const fd = new FormData()
      fd.set('seriesId', s.id)
      fd.set('keep', keep[s.id] ? 'yes' : 'no')
      if (props.inClaim) fd.set('flow', 'claim')
      const answer = await keepSeries(null, fd)
      if (answer?.state === 'refused') {
        setSaved(now)
        setSaid(answer.reason)
        setSaving(false)
        return
      }
      now[s.id] = keep[s.id]
    }
    setSaved(now)
    setSaving(false)
    if (props.onFinish) props.onFinish(props.series.filter((s) => keep[s.id]).map((s) => s.name))
    else setSaid('Saved.')
  }

  return (
    <div className="text-left">
      <ul className="mt-4 space-y-3">
        {props.series.map((s) => (
          <li key={s.id} className="rounded-lg border border-ink-200 p-3">
            <p className="text-sm font-semibold text-ink-900">{s.name}</p>
            <label className="mt-1 flex min-h-[44px] items-center gap-3 text-sm text-ink-600">
              <input type="checkbox" checked={keep[s.id]} onChange={(e) => setKeep({ ...keep, [s.id]: e.target.checked })} className="h-5 w-5 shrink-0" />
              Keep listing these automatically
            </label>
          </li>
        ))}
      </ul>
      {said ? (
        <p role="status" className="mt-2 text-sm text-ink-600">
          {said}
        </p>
      ) : null}
      <div className="mt-6">
        <button type="button" onClick={finish} disabled={saving} className={button}>
          {props.finishLabel}
        </button>
      </div>
    </div>
  )
}

/** The yes given from the organiser's page, with the claim page's two ticks (221201: one current yes per claim). */
export function GiveYesForm({ claimId, kind }: { claimId: string; kind: 'venue' | 'event' }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(giveYes, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="claimId" value={claimId} />
      <label className="flex min-h-[44px] items-start gap-3 text-sm text-ink-600">
        <input type="checkbox" name="permission" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span data-permission-words>{PERMISSION_WORDS}</span>
      </label>
      <label className="flex min-h-[44px] items-start gap-3 text-sm text-ink-600">
        <input type="checkbox" name="authority" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span data-authority-words>{claimAuthorityWords(kind)}</span>
      </label>
      <Answer state={state} done="Thank you. Your permission is on record, and you can add your photos and artwork below." />
      <div className="mt-3">
        <button type="submit" disabled={pending} className={button}>
          Give permission
        </button>
      </div>
    </form>
  )
}
