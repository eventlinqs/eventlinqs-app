'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import type { EventStatus } from '@/types/database'
import { canArchive, restoreTarget } from '@/lib/event-lifecycle'
import { ConfirmDialog } from './confirm-dialog'
import { archiveEvent, restoreEvent, deleteEvent } from '@/app/(dashboard)/dashboard/events/actions'

/**
 * ARCHIVE, RESTORE AND DELETE, THE SAME THREE CONTROLS EVERYWHERE AN ORGANISER
 * MANAGES AN EVENT: the events list rows and the event overview. One
 * implementation, so the list and the overview can never offer different exits
 * from the same status (close-out C13.8: a cancelled event must keep a full
 * action set, and it was the list that lost it).
 *
 * What is offered is decided by the lifecycle module (archive from any status
 * but archived, restore from archived) and by the database's own count of
 * money records (delete). The controls never restate either rule.
 */

export interface LifecycleEligibility {
  deletable: boolean
  /** The non-zero money records, in words, when delete is not offered. */
  reasons: string[]
}

export interface LifecycleEvent {
  id: string
  title: string
  status: EventStatus
  archived_from_status: EventStatus | null
}

interface Props {
  event: LifecycleEvent
  eligibility: LifecycleEligibility | null
  /** `row`: compact text controls in a table row. `panel`: full buttons with explanations. */
  variant: 'row' | 'panel'
  /** Where to go after a delete. The list refreshes in place; the overview has nowhere to stay. */
  afterDelete?: 'refresh' | 'list'
}

const ROW_LINK = 'text-xs disabled:opacity-40'
const PANEL_BUTTON =
  'inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:opacity-40'

export function EventLifecycleActions({ event, eligibility, variant, afterDelete = 'refresh' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null)

  const archivable = canArchive(event.status)
  const restoreTo = restoreTarget(event)
  const deletable = Boolean(eligibility?.deletable)
  const row = variant === 'row'

  function runRestore() {
    setError(null)
    startTransition(async () => {
      const result = await restoreEvent(event.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  async function confirmArchive() {
    const result = await archiveEvent(event.id)
    if (result.error) return { error: result.error }
    setDialog(null)
    router.refresh()
    return undefined
  }

  async function confirmDelete(typed: string) {
    const result = await deleteEvent(event.id, typed)
    if (result.error) return { error: result.error }
    setDialog(null)
    if (afterDelete === 'list') router.push('/dashboard/events?deleted=1')
    else router.refresh()
    return undefined
  }

  return (
    <>
      {error ? (
        <span role="alert" className={row ? 'text-xs text-error' : 'block text-sm text-error'}>
          {error}
        </span>
      ) : null}

      {archivable ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setDialog('archive')}
          className={
            row
              ? `${ROW_LINK} text-ink-600 hover:text-ink-900`
              : `${PANEL_BUTTON} border border-ink-200 bg-white text-ink-900 hover:bg-ink-100`
          }
        >
          {row ? null : <Archive className="h-4 w-4" aria-hidden="true" />}
          Archive
        </button>
      ) : null}

      {restoreTo ? (
        <button
          type="button"
          disabled={isPending}
          onClick={runRestore}
          className={
            row
              ? `${ROW_LINK} font-semibold text-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong-hover)]`
              : `${PANEL_BUTTON} bg-gold-400 text-ink-900 shadow-sm hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-md`
          }
        >
          {row ? null : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
          {isPending ? 'Restoring' : 'Restore'}
        </button>
      ) : null}

      {deletable ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setDialog('delete')}
          className={
            row
              // red-700 (#B91C1C), the error-700 tier: red-600 measured under 4.5:1
              // on the hovered row's ink-100 background at 12px (axe, C13 drive).
              ? `${ROW_LINK} text-red-700 hover:text-red-900`
              : `${PANEL_BUTTON} border border-error/40 bg-white text-error hover:bg-error/10`
          }
        >
          {row ? null : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          Delete
        </button>
      ) : null}

      <ConfirmDialog
        open={dialog === 'archive'}
        onClose={() => setDialog(null)}
        title={`Archive "${event.title}"?`}
        confirmLabel="Archive event"
        description={
          <>
            <p>
              It comes off every public page, search and the sitemap, and sales stop. Anyone who already
              holds a ticket keeps it and can still use it at the door.
            </p>
            <p>You can restore it any time from the Archived filter, and it goes back to being {statusWord(event.status)}.</p>
            {eligibility && !eligibility.deletable && event.status !== 'cancelled' ? (
              <p className="font-semibold text-ink-900">
                If this event is not going ahead, cancel it instead so refunds run. Archiving never replaces a
                cancellation.
              </p>
            ) : null}
          </>
        }
        onConfirm={confirmArchive}
      />

      <DeleteDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={event.title}
        onConfirm={confirmDelete}
      />
    </>
  )
}

function DeleteDialog({
  open,
  onClose,
  title,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  onConfirm: (typed: string) => Promise<{ error?: string } | undefined>
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete "${title}" for good?`}
      confirmLabel="Delete permanently"
      tone="danger"
      requireText={title}
      description={
        <>
          <p>
            This is permanent and there is no undo. The event, its ticket tiers, discount codes, lineup, seat
            map and artwork are all removed, and its address answers &quot;gone&quot; from now on.
          </p>
          <p>
            Delete is only offered because this event has never had an order, a ticket, a squad purchase, a
            discount redemption or a refund. The database checks that again as it deletes.
          </p>
        </>
      }
      onConfirm={() => onConfirm(title)}
    />
  )
}

function statusWord(status: EventStatus): string {
  switch (status) {
    case 'published':
      return 'live'
    case 'draft':
      return 'a draft'
    case 'scheduled':
      return 'scheduled to publish'
    default:
      return status
  }
}
