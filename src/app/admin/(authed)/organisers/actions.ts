'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { applyOrganiserAction } from '@/lib/admin/organisers'

export type OrganiserActionResponse = { ok: true } | { ok: false; error: string }

const TypedActionSchema = z.object({
  organisationId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  reason: z.string().max(500).nullable().optional(),
})

/** Typed organiser lifecycle action for the detail view (returns a result). */
export async function applyOrganiserActionTyped(input: {
  organisationId: string
  action: 'approve' | 'reject' | 'suspend' | 'reinstate'
  reason?: string | null
}): Promise<OrganiserActionResponse> {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.users.manage')

  const parsed = TypedActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const res = await applyOrganiserAction(
    { organisationId: parsed.data.organisationId, action: parsed.data.action, reason: parsed.data.reason ?? undefined },
    session,
  )
  if (res.invalidTransition) return { ok: false, error: 'That action is not allowed from the current status (it may have changed).' }
  if (!res.ok) return { ok: false, error: res.error ?? 'Action failed.' }

  revalidatePath('/admin/organisers')
  revalidatePath(`/admin/organisers/${parsed.data.organisationId}`)
  return { ok: true }
}

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
