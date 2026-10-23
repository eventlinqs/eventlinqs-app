'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/features/dashboard/confirm-dialog'
import { publishWalkInProgram } from '@/app/(dashboard)/dashboard/events/walk-in-actions'

/**
 * SEND THE FULL PROGRAM (WI1). Publishing the program sends the one program
 * update to everyone who asked for it on the event page, so it is a designed
 * confirmation, said in the organiser's terms, and it happens once: the database
 * refuses a second press.
 */
export function WalkInProgramPanel({
  eventId,
  published,
  waiting,
  isLive,
}: {
  eventId: string
  /** When the program was published, or null. */
  published: string | null
  /** How many people asked to be reminded. */
  waiting: number
  isLive: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  if (published) {
    return (
      <section className="mt-6 rounded-xl border border-ink-100 bg-white p-5">
        <h2 className="font-display text-base font-bold text-ink-900">Full program sent</h2>
        <p className="mt-1 text-sm text-ink-600">
          Sent on{' '}
          {new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney' }).format(
            new Date(published),
          )}
          . Each person who asked gets it once, and one reminder the day before.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink-100 bg-white p-5">
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold text-ink-900">Send the full program</h2>
        <p className="mt-1 text-sm text-ink-600">
          {waiting === 1 ? '1 person has' : `${waiting.toLocaleString('en-AU')} people have`} asked for it on the event page.
          When your day-by-day program is final, send it once. They also get one reminder the day before.
        </p>
        {done && (
          <p role="status" className="mt-2 text-sm font-semibold text-ink-900">
            {done}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={!isLive}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-full bg-ink-900 px-5 text-sm font-bold text-white hover:bg-[var(--color-navy-950)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Send the full program
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Send the full program now?"
        description={
          <>
            Everyone who asked for the program gets one email with your day-by-day program, today. This happens once and
            cannot be sent again, so make sure the program on your event page is final.
          </>
        }
        confirmLabel="Send it"
        onConfirm={async () => {
          const result = await publishWalkInProgram(eventId)
          if (!result.ok) return { error: result.error }
          setDone(result.message ?? 'Sent.')
          setOpen(false)
          router.refresh()
        }}
      />
    </section>
  )
}
