'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { applyEventAction } from '@/lib/admin/events'

const ActionSchema = z.object({
  eventId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'cancel']),
  reason: z.string().max(500).optional(),
  returnTo: z.string().optional(),
})

/**
 * Applies one event moderation action, then redirects back to the filtered
 * list with a status banner. Server-only form action.
 */
export async function eventActionForm(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.events.manage')

  const parsed = ActionSchema.safeParse({
    eventId: formData.get('eventId'),
    action: formData.get('action'),
    reason: formData.get('reason') || undefined,
    returnTo: formData.get('returnTo') || undefined,
  })
  if (!parsed.success) redirect('/admin/events?notice=invalid')

  const { eventId, action, reason, returnTo } = parsed.data
  const base = safeReturnTo(returnTo)

  const res = await applyEventAction({ eventId, action, reason }, session)
  if (res.invalidTransition) redirect(appendNotice(base, 'stale'))
  if (!res.ok) redirect(appendNotice(base, 'error'))
  redirect(appendNotice(base, 'done', action))
}

function safeReturnTo(returnTo: string | undefined): string {
  if (returnTo && returnTo.startsWith('/admin/events')) return returnTo
  return '/admin/events'
}

function appendNotice(base: string, notice: string, action?: string): string {
  const [path, query = ''] = base.split('?')
  const sp = new URLSearchParams(query)
  sp.delete('notice')
  sp.delete('action')
  sp.set('notice', notice)
  if (action) sp.set('action', action)
  return `${path}?${sp.toString()}`
}
