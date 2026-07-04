'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { transferTicket } from '@/app/actions/transfer-ticket'

/**
 * Transfer / gift a ticket to a new holder. The server action rotates the QR so
 * the old code dies and the new holder is emailed a fresh bearer link. Only the
 * ticket owner / current holder can do this (enforced server-side).
 */
export function TransferTicketForm({ ticketId, eventTitle }: { ticketId: string; eventTitle: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await transferTicket(ticketId, email, name)
      if ('ok' in res) {
        setMsg({ kind: 'ok', text: `Sent to ${email.trim().toLowerCase()}. Their new QR is on the way and your old code no longer works.` })
        setOpen(false)
        setEmail('')
        setName('')
        router.refresh()
      } else {
        setMsg({ kind: 'err', text: res.error })
      }
    })
  }

  return (
    <div className="mt-2">
      {!open && !msg && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-[var(--brand-accent-strong)] hover:underline"
        >
          Transfer or gift this ticket
        </button>
      )}

      {msg && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}
        >
          {msg.text}
        </p>
      )}

      {open && (
        <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-sm font-semibold text-ink-900">Transfer {eventTitle}</p>
          <p className="text-xs text-ink-600">
            The new holder receives a fresh ticket by email. Your current code stops working.
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New holder name"
            className="h-10 w-full rounded-lg border border-ink-300 px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
            autoComplete="off"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="New holder email"
            className="h-10 w-full rounded-lg border border-ink-300 px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? 'Sending' : 'Send ticket'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
