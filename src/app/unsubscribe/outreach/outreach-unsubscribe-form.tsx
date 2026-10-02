'use client'

import { useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  unsubscribeFromOutreachAction,
  type OutreachUnsubscribeState,
} from '@/app/actions/outreach-unsubscribe'
import { OUTREACH_COMMENT_MAX, OUTREACH_UNSUBSCRIBE_REASONS } from '@/lib/outreach/unsubscribe'

const INITIAL: OutreachUnsubscribeState = { status: 'idle' }

const HEADING = 'Unsubscribe from EventLinqs emails'
const INTRO = "Before you go, would you tell us why? It's optional, and it helps us do better."
const DONE_HEADING = "You're unsubscribed"
const DONE_TEXT = "You won't receive any more emails from us. Thank you for letting us know."

/**
 * One form, one press. The reason and the comment are optional and nothing is
 * preselected, so unsubscribing never depends on answering (ACMA: no extra
 * information may be required). The address field appears only when the link
 * carried no usable contact id.
 *
 * Every outcome is on screen: pending while it runs, a message beside the
 * field it is about when the server refuses a value, and the confirmation in
 * place of the form when the row is recorded. A failed write is thrown, not
 * returned, so it reaches the error boundary beside this file rather than
 * being shown here as a success.
 */
export function OutreachUnsubscribeForm({ contactId }: { contactId: string | null }) {
  const [state, action, pending] = useActionState(unsubscribeFromOutreachAction, INITIAL)
  const doneHeading = useRef<HTMLHeadingElement>(null)
  const done = state.status === 'done'

  // The form a screen reader was in has just been replaced, so focus moves to
  // the sentence that replaced it rather than being dropped on the body.
  useEffect(() => {
    if (done) doneHeading.current?.focus()
  }, [done])

  if (done) {
    return (
      <div className="text-center">
        <h1
          ref={doneHeading}
          tabIndex={-1}
          className="font-display text-2xl font-bold text-ink-900 focus:outline-none"
        >
          {DONE_HEADING}
        </h1>
        <p className="mt-3 text-sm text-ink-600">{DONE_TEXT}</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
        >
          Go to EventLinqs
        </Link>
      </div>
    )
  }

  const fieldError = state.status === 'invalid' ? state : null
  const emailError = fieldError?.field === 'email' ? fieldError.message : null
  const reasonError = fieldError?.field === 'reason' ? fieldError.message : null
  const commentError = fieldError?.field === 'comment' ? fieldError.message : null

  return (
    <>
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-ink-900">{HEADING}</h1>
        <p className="mt-3 text-sm text-ink-600">{INTRO}</p>
      </div>

      <form action={action} className="mt-6 space-y-6">
        {contactId !== null ? <input type="hidden" name="id" value={contactId} /> : null}

        {contactId === null ? (
          <div>
            <label htmlFor="outreach-unsubscribe-email" className="block text-sm font-medium text-ink-900">
              Your email address
            </label>
            <input
              id="outreach-unsubscribe-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'outreach-unsubscribe-email-error' : undefined}
              className="mt-2 h-11 w-full rounded-lg border border-ink-300 px-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            {emailError ? (
              <p id="outreach-unsubscribe-email-error" role="alert" className="mt-2 text-sm text-red-700">
                {emailError}
              </p>
            ) : null}
          </div>
        ) : null}

        <fieldset aria-describedby={reasonError ? 'outreach-unsubscribe-reason-error' : undefined}>
          <legend className="text-sm font-medium text-ink-900">Your reason (optional)</legend>
          <div className="mt-2 space-y-2">
            {OUTREACH_UNSUBSCRIBE_REASONS.map((reason) => {
              const id = `outreach-unsubscribe-reason-${reason.value}`
              return (
                <label
                  key={reason.value}
                  htmlFor={id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 hover:border-ink-300 has-[:checked]:border-ink-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500"
                >
                  <input
                    id={id}
                    type="radio"
                    name="reason"
                    value={reason.value}
                    className="h-4 w-4 shrink-0 accent-ink-900"
                  />
                  <span>{reason.label}</span>
                </label>
              )
            })}
          </div>
          {reasonError ? (
            <p id="outreach-unsubscribe-reason-error" role="alert" className="mt-2 text-sm text-red-700">
              {reasonError}
            </p>
          ) : null}
        </fieldset>

        <div>
          <label htmlFor="outreach-unsubscribe-comment" className="block text-sm font-medium text-ink-900">
            {"Anything else you'd like to tell us? (optional)"}
          </label>
          <textarea
            id="outreach-unsubscribe-comment"
            name="comment"
            rows={4}
            maxLength={OUTREACH_COMMENT_MAX}
            aria-invalid={commentError ? true : undefined}
            aria-describedby={commentError ? 'outreach-unsubscribe-comment-error' : undefined}
            className="mt-2 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          {commentError ? (
            <p id="outreach-unsubscribe-comment-error" role="alert" className="mt-2 text-sm text-red-700">
              {commentError}
            </p>
          ) : null}
        </div>

        {state.status === 'limited' ? (
          <p role="alert" className="text-sm text-red-700">
            {state.message}
          </p>
        ) : null}

        <div className="text-center">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60"
          >
            {pending ? 'Unsubscribing' : 'Unsubscribe'}
          </button>
        </div>
      </form>
    </>
  )
}
