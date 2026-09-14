'use client'

import { useState, useTransition } from 'react'
import { Accessibility } from 'lucide-react'
import {
  ACCESSIBILITY_FLAGS,
  type AccessibilityScope,
} from '@/lib/accessibility/fields'
import {
  saveEventAccessibility,
  saveVenueAccessibility,
  type AccessibilityInput,
} from '@/app/actions/accessibility'

/**
 * THE PANEL AN ORGANISER OR A VENUE FILLS IN.
 *
 * Close-out SEO5 step 4. One component for both scopes, so the event form and
 * the venue form cannot offer different fields or word them differently, and so
 * adding a flag is one entry in `ACCESSIBILITY_FLAGS` rather than two forms.
 *
 * ============================================================================
 * IT SAVES ON ITS OWN, AND THAT IS DELIBERATE
 * ============================================================================
 *
 * It does not join the event form's submit. The reason is in
 * `src/app/actions/accessibility.ts`: the columns are created by a migration
 * that is PARKED awaiting the founder, and PostgREST fails the whole statement
 * on a column it does not have, so folding these fields into `updateEvent`
 * would stop every organiser editing every event until he applied it.
 *
 * WHEN THE COLUMNS ARE NOT THERE the action says so, in words, and this panel
 * prints that sentence and disables itself. Nothing else on the page is
 * affected, which is the whole point of keeping the write separate.
 *
 * ============================================================================
 * NO NEGATIVES ARE COLLECTED EITHER
 * ============================================================================
 *
 * Each flag is a single checkbox, not a yes/no pair. An unticked box means NOT
 * STATED and is stored as `false`, which the public page never renders. A
 * three-state control would invite somebody to display the third state, and
 * "the organiser said no" is a claim this platform has no business making on
 * their behalf.
 */
export function AccessibilityFields({
  scope,
  subjectId,
  initial,
  className = '',
}: {
  scope: AccessibilityScope
  /** The event id or the venue id the values belong to. */
  subjectId: string
  initial: AccessibilityInput
  className?: string
}) {
  const flags = ACCESSIBILITY_FLAGS.filter(f => f.scopes.includes(scope))
  const [values, setValues] = useState<AccessibilityInput>(initial)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [pending, startTransition] = useTransition()

  function toggle(column: string, on: boolean) {
    setValues(v => ({ ...v, flags: { ...v.flags, [column]: on } }))
    setMessage(null)
  }

  function save() {
    startTransition(async () => {
      const result =
        scope === 'event'
          ? await saveEventAccessibility(subjectId, values)
          : await saveVenueAccessibility(subjectId, values)
      if (result.error) {
        setMessage({ kind: 'error', text: result.error })
        if (result.notMigrated) setDisabled(true)
        return
      }
      setMessage({ kind: 'ok', text: 'Access details saved. They are live on the public page.' })
    })
  }

  return (
    <section className={`rounded-2xl border border-ink-200 bg-white p-5 sm:p-6 ${className}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)] text-[var(--brand-accent-strong)]"
        >
          <Accessibility className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">Accessibility</h2>
          <p className="type-measure mt-1 text-sm leading-relaxed text-ink-600">
            Tick only what is true. Anything left unticked is shown as nothing at all, never as a
            no, and the whole section is hidden while it is empty.
          </p>
        </div>
      </div>

      <fieldset className="mt-5" disabled={disabled || pending}>
        <legend className="sr-only">Access features</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {flags.map(flag => (
            <label
              key={flag.column}
              htmlFor={`access-${flag.column}`}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3 transition-colors hover:border-ink-400"
            >
              <input
                id={`access-${flag.column}`}
                type="checkbox"
                checked={values.flags[flag.column] === true}
                onChange={e => toggle(flag.column, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-accent-strong)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-900">{flag.label}</span>
                <span className="block text-xs leading-relaxed text-ink-600">{flag.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5">
          <label htmlFor="access-notes" className="mb-1 block text-sm font-medium text-ink-600">
            Anything else an attendee with access needs should know
          </label>
          <textarea
            id="access-notes"
            rows={4}
            maxLength={2000}
            value={values.notes ?? ''}
            onChange={e => {
              setValues(v => ({ ...v, notes: e.target.value }))
              setMessage(null)
            }}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus-visible:border-ink-900 focus-visible:outline-none"
            placeholder="For example: the accessible entrance is on the laneway side and staff will meet you there."
          />
        </div>

        <div className="mt-4">
          <label htmlFor="access-contact" className="mb-1 block text-sm font-medium text-ink-600">
            Who to contact about access
          </label>
          <input
            id="access-contact"
            type="text"
            maxLength={200}
            value={values.contact ?? ''}
            onChange={e => {
              setValues(v => ({ ...v, contact: e.target.value }))
              setMessage(null)
            }}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus-visible:border-ink-900 focus-visible:outline-none"
            placeholder="A phone number or an email address"
          />
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={disabled || pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Saving' : 'Save access details'}
        </button>
        {message && (
          <p
            role="status"
            className={`text-sm ${message.kind === 'ok' ? 'text-ink-600' : 'text-error-strong'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
