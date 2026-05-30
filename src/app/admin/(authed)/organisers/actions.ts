'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { applyOrganiserAction } from '@/lib/admin/organisers'

const ActionSchema = z.object({
  organisationId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  reason: z.string().max(500).optional(),
  // Preserve the current filter/page so the user lands back where they were.
  returnTo: z.string().optional(),
})

/**
 * Applies one organiser lifecycle action, then redirects back to the
 * filtered list with a status banner. Server-only form action.
 */
export async function organiserActionForm(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.users.manage')

  const parsed = ActionSchema.safeParse({
    organisationId: formData.get('organisationId'),
    action: formData.get('action'),
    reason: formData.get('reason') || undefined,
    returnTo: formData.get('returnTo') || undefined,
  })
  if (!parsed.success) redirect('/admin/organisers?notice=invalid')

  const { organisationId, action, reason, returnTo } = parsed.data
  const base = safeReturnTo(returnTo)

  const res = await applyOrganiserAction({ organisationId, action, reason }, session)
  if (res.invalidTransition) redirect(appendNotice(base, 'stale'))
  if (!res.ok) redirect(appendNotice(base, 'error'))
  redirect(appendNotice(base, 'done', action))
}

// Only allow same-path returns to avoid open-redirect via the hidden field.
function safeReturnTo(returnTo: string | undefined): string {
  if (returnTo && returnTo.startsWith('/admin/organisers')) return returnTo
  return '/admin/organisers'
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
