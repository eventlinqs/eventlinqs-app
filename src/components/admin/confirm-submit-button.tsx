'use client'

import { useRef } from 'react'

/**
 * Submit button that requires a native confirm before posting its form.
 *
 * Used for destructive admin actions (suspend, reject, cancel) where an
 * accidental click is costly. The form is still a plain server-action
 * form, so the action runs server-side with no client logic beyond the
 * confirmation gate. If the user cancels, the submit is blocked.
 */
export function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  form,
}: {
  children: React.ReactNode
  confirmMessage: string
  className?: string
  /** Associate with a form by id when the button sits outside it. */
  form?: string
}) {
  const blocked = useRef(false)
  return (
    <button
      type="submit"
      form={form}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault()
          blocked.current = true
        }
      }}
    >
      {children}
    </button>
  )
}
