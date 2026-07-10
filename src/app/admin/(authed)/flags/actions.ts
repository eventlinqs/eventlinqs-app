'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { isBroadcastFlag } from '@/lib/flags/broadcast'
import { setBroadcastFlag } from '@/lib/admin/flags'

const SwitchSchema = z.object({
  flag: z.string().refine(isBroadcastFlag, 'unknown flag'),
  enabled: z.enum(['true', 'false']),
})

/**
 * Switches one Broadcast Layer stage flag. Server-only form action, no client
 * JS required. The write is audit-logged and the resolver cache invalidated,
 * so the stage switches with no deploy (SPEC section 6).
 */
export async function switchFlagAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.flags.manage')

  const parsed = SwitchSchema.safeParse({
    flag: formData.get('flag'),
    enabled: formData.get('enabled'),
  })
  if (!parsed.success) {
    redirect('/admin/flags?status=invalid')
  }

  const flag = parsed.data.flag
  if (!isBroadcastFlag(flag)) {
    redirect('/admin/flags?status=invalid')
    return
  }
  const res = await setBroadcastFlag(flag, parsed.data.enabled === 'true', session)
  if (!res.ok) {
    redirect(`/admin/flags?status=error&flag=${encodeURIComponent(flag)}`)
  }
  redirect(`/admin/flags?status=saved&flag=${encodeURIComponent(flag)}`)
}
