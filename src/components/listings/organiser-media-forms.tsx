'use client'

import { useState, type ReactNode } from 'react'
import { addMedia, giveYes, keepSeries, replaceMedia, withdrawMedia, withdrawYes } from '@/app/actions/organiser-media'
import { createSectionAnswers, StatusLine, SubmitButton } from '@/components/ui/section-answers'
import { claimAuthorityWords } from '@/lib/listings/claim-acceptance'
import { IMAGE_REPLACED_WORDS, IMAGE_WITHDRAWN_WORDS, YES_WITHDRAWN_WORDS } from '@/lib/listings/media-words'
import { PERMISSION_WORDS } from '@/lib/listings/submission'

/**
 * The organiser's own image forms, on /dashboard/organisation/media and the claim page's upload step, each showing the
 * database's answer in its own words. Classes are the claim form's own (src/components/listings/claim-form.tsx), so
 * nothing here is new to the design system. On the dashboard each answer is held by OrganiserMediaAnswers around its
 * section (src/components/ui/section-answers.tsx says why): a withdrawn image or permission leaves the list with its
 * form, and a yes given leaves the unanswered claims. On the claim card, which refreshes nothing, a form holds its own.
 */

const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
const file = 'mt-1 block w-full text-sm text-ink-600 file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-ink-100 file:px-4 file:text-sm file:font-semibold file:text-ink-900'
const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'
const quiet = 'inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60'

const { Answers, AnswerLine, useAnswerFor } = createSectionAnswers({
  add: { act: addMedia, done: 'Added. Our team checks each image before it is used.' },
  replace: { act: replaceMedia, done: IMAGE_REPLACED_WORDS },
  withdraw: { act: withdrawMedia, done: IMAGE_WITHDRAWN_WORDS },
  withdrawYes: { act: withdrawYes, done: YES_WITHDRAWN_WORDS },
  giveYes: { act: giveYes, done: 'Thank you. Your permission is on record, and you can add your photos and artwork below.' },
})

export const OrganiserMediaAnswers = Answers
export const OrganiserMediaAnswerLine = AnswerLine

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
  const { action, field, line } = useAnswerFor('add')
  return (
    <form action={action} className="text-left">
      {field}
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
      {line}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton className={button}>
          {submitLabel}
        </SubmitButton>
        {after}
      </div>
    </form>
  )
}

export function ReplaceMediaForm({ assetId }: { assetId: string }) {
  const { action, field, line } = useAnswerFor('replace', assetId)
  return (
    <form action={action} className="text-left">
      {field}
      <input type="hidden" name="assetId" value={assetId} />
      <label className="block text-sm font-medium text-ink-900">
        Replace with
        <input type="file" name="file" accept="image/*" required className={file} />
      </label>
      {line}
      <div className="mt-3">
        <SubmitButton className={quiet}>
          Replace
        </SubmitButton>
      </div>
    </form>
  )
}

export function WithdrawMediaForm({ assetId }: { assetId: string }) {
  const { action, field, line } = useAnswerFor('withdraw', assetId)
  return (
    <form action={action} className="text-left">
      {field}
      <input type="hidden" name="assetId" value={assetId} />
      <label className="block text-sm font-medium text-ink-900">
        Why are you withdrawing it?
        <input name="reason" required minLength={3} maxLength={500} className={input} />
      </label>
      {line}
      <div className="mt-3">
        <SubmitButton className={quiet}>
          Withdraw this image
        </SubmitButton>
      </div>
    </form>
  )
}

export function WithdrawYesForm({ permissionId }: { permissionId: string }) {
  const { action, field, line } = useAnswerFor('withdrawYes', permissionId)
  return (
    <form action={action} className="text-left">
      {field}
      <input type="hidden" name="permissionId" value={permissionId} />
      <label className="block text-sm font-medium text-ink-900">
        Why are you withdrawing your permission?
        <input name="reason" required minLength={3} maxLength={500} className={input} />
      </label>
      {line}
      <div className="mt-3">
        <SubmitButton className={quiet}>
          Withdraw my permission
        </SubmitButton>
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
      <StatusLine words={said ?? ''} />
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
  const { action, field, line } = useAnswerFor('giveYes', claimId)
  return (
    <form action={action} className="text-left">
      {field}
      <input type="hidden" name="claimId" value={claimId} />
      <label className="flex min-h-[44px] items-start gap-3 text-sm text-ink-600">
        <input type="checkbox" name="permission" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span data-permission-words>{PERMISSION_WORDS}</span>
      </label>
      <label className="flex min-h-[44px] items-start gap-3 text-sm text-ink-600">
        <input type="checkbox" name="authority" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span data-authority-words>{claimAuthorityWords(kind)}</span>
      </label>
      {line}
      <div className="mt-3">
        <SubmitButton className={button}>
          Give permission
        </SubmitButton>
      </div>
    </form>
  )
}
