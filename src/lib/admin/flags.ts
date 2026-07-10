import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import {
  BROADCAST_FLAGS,
  BROADCAST_FLAG_DEFAULTS,
  invalidateFeatureFlag,
  type BroadcastFlag,
} from '@/lib/flags/broadcast'
import type { AdminSession } from '@/lib/admin/types'

/**
 * Admin feature-flag controls (the Broadcast Layer stage switches).
 *
 * Reads and writes the live public.feature_flags table that the single
 * resolver (src/lib/flags/broadcast.ts) reads, so a stage switches on or off
 * with no code deploy. Every write is audit-logged old to new and the
 * resolver cache is invalidated so the switch lands on the next read.
 */

export interface AdminFlagView {
  flag: BroadcastFlag
  enabled: boolean
  description: string
  updatedAt: string | null
  launchDefault: boolean
}

/** Reads the current state of every broadcast stage flag, in display order. */
export async function readBroadcastFlags(): Promise<AdminFlagView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('feature_flags')
    .select('flag, enabled, description, updated_at')
    .in('flag', [...BROADCAST_FLAGS])
  if (error) {
    throw new Error(`feature_flags read failed: ${error.message}`)
  }
  const byFlag = new Map((data ?? []).map((row) => [row.flag as string, row]))
  return BROADCAST_FLAGS.map((flag) => {
    const row = byFlag.get(flag)
    return {
      flag,
      enabled: row?.enabled ?? BROADCAST_FLAG_DEFAULTS[flag],
      description: row?.description ?? '',
      updatedAt: row?.updated_at ?? null,
      launchDefault: BROADCAST_FLAG_DEFAULTS[flag],
    }
  })
}

/**
 * Switches one stage flag. Audit-logged with the old and new state, and the
 * resolver cache is invalidated so the change propagates immediately.
 */
export async function setBroadcastFlag(
  flag: BroadcastFlag,
  enabled: boolean,
  session: AdminSession,
): Promise<{ ok: boolean; changed: boolean }> {
  const admin = createAdminClient()
  const { data: current, error: readError } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('flag', flag)
    .maybeSingle()
  if (readError) return { ok: false, changed: false }

  const previous = current?.enabled ?? BROADCAST_FLAG_DEFAULTS[flag]
  if (previous === enabled) return { ok: true, changed: false }

  const { error: writeError } = await admin
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString(), updated_by: session.userId })
    .eq('flag', flag)
  if (writeError) return { ok: false, changed: false }

  await invalidateFeatureFlag(flag)
  await recordAuditEvent({
    action: 'admin.flags.switch',
    targetType: 'feature_flag',
    targetId: flag,
    metadata: { from: previous, to: enabled },
    session,
  })
  return { ok: true, changed: true }
}
