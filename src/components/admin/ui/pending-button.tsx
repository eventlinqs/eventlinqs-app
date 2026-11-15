'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { LoaderCircle } from 'lucide-react'

/**
 * A form's submit button that shows it was pressed (Lawal, 15 November 2026, 20:52, item 2: "I should click a button and
 * obviously know what's happened"): while the form's action runs it is disabled, says what it is doing and turns a
 * spinner; the page then shows the result as a toast (admin-toast.tsx).
 */
export function PendingButton({ children, pending, className }: { children: ReactNode; pending: string; className: string }) {
  const { pending: busy } = useFormStatus()
  return (
    <button type="submit" disabled={busy} aria-busy={busy} className={className}>
      {busy ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {busy ? pending : children}
    </button>
  )
}
