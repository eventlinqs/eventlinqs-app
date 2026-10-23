'use client'

import { useId, useState, type FormEvent } from 'react'
import { requestEventReminder } from '@/app/actions/event-reminder'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { REMIND_ME_TRAP_FIELD } from '@/lib/walk-in/remind-me'
import { REMIND_ME, YOUR_EMAIL } from '@/lib/walk-in/page-copy'

/**
 * REMIND ME (WI1-ITEM.md point 3, locked design A).
 *
 * One email box, the purpose stated beside the button in the item's words, and
 * a hidden field a person never fills (Lawal's change 4, 21 October 2026). The
 * trap is off screen rather than display:none, out of the tab order, hidden from
 * assistive technology and named so no browser autofills it; a script that
 * fills every field gets the same "Done" a person gets and stores nothing.
 */
export function RemindMeForm({
  eventId,
  heading,
  purpose,
  autoFocus = false,
}: {
  eventId: string
  heading: string
  purpose: string
  autoFocus?: boolean
}) {
  const inputId = useId()
  const purposeId = useId()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  // No native submit before the handler exists: a submit in that window is a
  // GET with the email address in the URL. See use-hydrated.ts.
  const hydrated = useHydrated()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    // The trap is read from the form as submitted, not from React state, so a
    // script that sets the field's value without firing an input event is
    // still caught.
    const trap = String(new FormData(e.currentTarget).get(REMIND_ME_TRAP_FIELD) ?? '')
    setState('sending')
    setMessage(null)
    try {
      const result = await requestEventReminder({ eventId, email, trap })
      if (result.ok) {
        setState('done')
        setMessage(result.message)
      } else {
        setState('error')
        setMessage(result.error)
      }
    } catch {
      setState('error')
      setMessage('That did not save. Please try again in a moment.')
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2.5" data-remind-me-form>
      <label htmlFor={inputId} className="text-[15px] font-bold text-ink-900">
        {heading}
      </label>
      <input
        id={inputId}
        type="email"
        name="email"
        inputMode="email"
        autoComplete="email"
        required
        autoFocus={autoFocus}
        placeholder={YOUR_EMAIL}
        aria-describedby={purposeId}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state === 'done'}
        className="min-h-12 rounded-[var(--radius-panel)] border border-ink-200 bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-600 focus-visible:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
      />
      {/* The trap. Never seen, never reached by Tab, never read aloud. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${inputId}-${REMIND_ME_TRAP_FIELD}`}>Leave this empty</label>
        <input
          id={`${inputId}-${REMIND_ME_TRAP_FIELD}`}
          type="text"
          name={REMIND_ME_TRAP_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <button
        type="submit"
        disabled={!hydrated || state === 'sending' || state === 'done'}
        className="min-h-[52px] rounded-full bg-[var(--color-gold-400)] text-base font-extrabold text-ink-900 transition-[filter] duration-200 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-80"
      >
        {state === 'sending' ? 'Saving' : REMIND_ME}
      </button>
      <p id={purposeId} className="m-0 text-[13px] leading-[1.5] text-ink-600">
        {purpose}
      </p>
      <p aria-live="polite" role="status" className={message ? 'm-0 text-sm font-semibold text-ink-900' : 'sr-only'}>
        {message}
      </p>
    </form>
  )
}
