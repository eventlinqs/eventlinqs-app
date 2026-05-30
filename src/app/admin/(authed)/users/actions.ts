'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { changeUserRole, ASSIGNABLE_ROLES } from '@/lib/admin/users'

const ChangeRoleSchema = z.object({
  userId: z.string().uuid(),
  newRole: z.enum(ASSIGNABLE_ROLES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
  returnTo: z.string().optional(),
})

/**
 * Changes one user's platform role, then redirects back to the filtered list
 * with a status banner. Server-only form action.
 */
export async function changeUserRoleForm(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.users.manage')

  const parsed = ChangeRoleSchema.safeParse({
    userId: formData.get('userId'),
    newRole: formData.get('newRole'),
    reason: formData.get('reason') || undefined,
    returnTo: formData.get('returnTo') || undefined,
  })
  if (!parsed.success) redirect('/admin/users?notice=invalid')

  const { userId, newRole, reason, returnTo } = parsed.data
  const base = safeReturnTo(returnTo)

  const res = await changeUserRole({ userId, newRole: newRole as (typeof ASSIGNABLE_ROLES)[number], reason }, session)
  if (!res.ok) redirect(appendNotice(base, 'error'))
  redirect(appendNotice(base, res.changed ? 'done' : 'nochange'))
}

function safeReturnTo(returnTo: string | undefined): string {
  if (returnTo && returnTo.startsWith('/admin/users')) return returnTo
  return '/admin/users'
}

function appendNotice(base: string, notice: string): string {
  const [path, query = ''] = base.split('?')
  const sp = new URLSearchParams(query)
  sp.delete('notice')
  sp.set('notice', notice)
  return `${path}?${sp.toString()}`
}
