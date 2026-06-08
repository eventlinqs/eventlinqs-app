'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import {
  addAdminByEmail,
  setAdminRole,
  setAdminDisabled,
  setAdminCapabilities,
  STAFF_CAPABILITIES,
} from '@/lib/admin/admin-staff'

const RoleEnum = z.enum(['super_admin', 'admin', 'support', 'moderator'])

function assertStaffManager(session: Awaited<ReturnType<typeof requireAdminSession>>) {
  assertCan(session, 'admin.invites.manage')
}

const AddSchema = z.object({
  email: z.string().email(),
  role: RoleEnum,
  displayName: z.string().trim().max(120).optional(),
})

export async function addAdminAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertStaffManager(session)
  const parsed = AddSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
    displayName: formData.get('displayName') || undefined,
  })
  if (!parsed.success) redirect('/admin/staff?status=add_invalid')
  const res = await addAdminByEmail(parsed.data, session)
  if (!res.ok) redirect(`/admin/staff?status=add_error&msg=${encodeURIComponent(res.error ?? 'error')}`)
  redirect('/admin/staff?status=added')
}

const RoleSchema = z.object({ id: z.string().uuid(), role: RoleEnum })

export async function setRoleAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertStaffManager(session)
  const parsed = RoleSchema.safeParse({ id: formData.get('id'), role: formData.get('role') })
  if (!parsed.success) redirect('/admin/staff?status=add_invalid')
  const res = await setAdminRole(parsed.data, session)
  if (!res.ok) redirect(`/admin/staff/${parsed.data.id}?status=error&msg=${encodeURIComponent(res.error ?? 'error')}`)
  redirect(`/admin/staff/${parsed.data.id}?status=role_saved`)
}

const DisableSchema = z.object({ id: z.string().uuid(), disabled: z.enum(['true', 'false']) })

export async function setDisabledAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertStaffManager(session)
  const parsed = DisableSchema.safeParse({ id: formData.get('id'), disabled: formData.get('disabled') })
  if (!parsed.success) redirect('/admin/staff?status=add_invalid')
  const res = await setAdminDisabled({ id: parsed.data.id, disabled: parsed.data.disabled === 'true' }, session)
  if (!res.ok) redirect(`/admin/staff/${parsed.data.id}?status=error&msg=${encodeURIComponent(res.error ?? 'error')}`)
  redirect(`/admin/staff/${parsed.data.id}?status=${parsed.data.disabled === 'true' ? 'disabled' : 'enabled'}`)
}

export async function setCapabilitiesAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertStaffManager(session)
  const id = String(formData.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/admin/staff?status=add_invalid')

  // Each capability submits cap.<key> = inherit | grant | revoke.
  const granted: string[] = []
  const revoked: string[] = []
  for (const cap of STAFF_CAPABILITIES) {
    const mode = String(formData.get(`cap.${cap}`) ?? 'inherit')
    if (mode === 'grant') granted.push(cap)
    else if (mode === 'revoke') revoked.push(cap)
  }
  const res = await setAdminCapabilities({ id, granted, revoked }, session)
  if (!res.ok) redirect(`/admin/staff/${id}?status=error&msg=${encodeURIComponent(res.error ?? 'error')}`)
  redirect(`/admin/staff/${id}?status=caps_saved`)
}
