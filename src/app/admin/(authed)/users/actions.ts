'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { changeUserRole, setUserSuspension, ASSIGNABLE_ROLES } from '@/lib/admin/users'

export type UserActionResult = { ok: true } | { ok: false; error: string }

const SuspendSchema = z.object({
  userId: z.string().uuid(),
  suspend: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
})

/** Suspend or reactivate a user (Auth ban). RBAC: admin.users.manage. Audited. */
export async function setUserSuspensionAction(input: {
  userId: string
  suspend: boolean
  reason?: string | null
}): Promise<UserActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.users.manage')

  const parsed = SuspendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const res = await setUserSuspension(
    { userId: parsed.data.userId, suspend: parsed.data.suspend, reason: parsed.data.reason ?? undefined },
    session,
  )
  if (!res.ok) return { ok: false, error: res.error ?? 'Action failed.' }

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${parsed.data.userId}`)
  return { ok: true }
}

const ChangeRoleActionSchema = z.object({
  userId: z.string().uuid(),
  newRole: z.enum(ASSIGNABLE_ROLES as unknown as [string, ...string[]]),
  reason: z.string().max(500).nullable().optional(),
})

/** Typed role change for the detail view (returns a result, not a redirect). */
export async function changeUserRoleAction(input: {
  userId: string
  newRole: string
  reason?: string | null
}): Promise<UserActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.users.manage')

  const parsed = ChangeRoleActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const res = await changeUserRole(
    { userId: parsed.data.userId, newRole: parsed.data.newRole as (typeof ASSIGNABLE_ROLES)[number], reason: parsed.data.reason ?? undefined },
    session,
  )
  if (!res.ok) return { ok: false, error: res.error ?? 'Action failed.' }

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${parsed.data.userId}`)
  return { ok: true }
}

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
  assertCan(session, 'admin.users.manage')

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
