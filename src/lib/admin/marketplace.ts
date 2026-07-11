import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import type { AdminSession } from '@/lib/admin/types'

/**
 * Admin data layer for performer marketplace moderation: the report queue
 * and gig removal. Every mutation is audit-logged, matching the organiser
 * moderation lifecycle pattern.
 */

export interface MarketplaceReportRow {
  id: string
  target_type: 'gig' | 'application' | 'artist_profile'
  target_id: string
  reason: string
  note: string
  status: 'open' | 'reviewed' | 'dismissed' | 'actioned'
  created_at: string
  reporter_email: string | null
  target_label: string | null
}

export async function listMarketplaceReports(
  status?: string,
): Promise<MarketplaceReportRow[]> {
  const admin = createAdminClient()
  let query = admin
    .from('marketplace_reports')
    .select('id, target_type, target_id, reporter_user_id, reason, note, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (status && ['open', 'reviewed', 'dismissed', 'actioned'].includes(status)) {
    query = query.eq('status', status)
  }
  const { data } = await query
  const rows = (data ?? []) as {
    id: string
    target_type: 'gig' | 'application' | 'artist_profile'
    target_id: string
    reporter_user_id: string | null
    reason: string
    note: string
    status: MarketplaceReportRow['status']
    created_at: string
  }[]

  // Resolve human labels in batches: reporter emails and target names.
  const reporterIds = [...new Set(rows.map((r) => r.reporter_user_id).filter(Boolean))] as string[]
  const emailById = new Map<string, string>()
  if (reporterIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, email').in('id', reporterIds)
    for (const p of (profiles ?? []) as { id: string; email: string }[]) emailById.set(p.id, p.email)
  }

  const gigIds = rows.filter((r) => r.target_type === 'gig').map((r) => r.target_id)
  const gigTitleById = new Map<string, string>()
  if (gigIds.length > 0) {
    const { data: gigs } = await admin.from('gigs').select('id, title').in('id', gigIds)
    for (const g of (gigs ?? []) as { id: string; title: string }[]) gigTitleById.set(g.id, g.title)
  }
  const artistIds = rows.filter((r) => r.target_type === 'artist_profile').map((r) => r.target_id)
  const artistNameById = new Map<string, string>()
  if (artistIds.length > 0) {
    const { data: artists } = await admin.from('artists').select('id, name').in('id', artistIds)
    for (const a of (artists ?? []) as { id: string; name: string }[]) artistNameById.set(a.id, a.name)
  }

  return rows.map((r) => ({
    id: r.id,
    target_type: r.target_type,
    target_id: r.target_id,
    reason: r.reason,
    note: r.note,
    status: r.status,
    created_at: r.created_at,
    reporter_email: r.reporter_user_id ? (emailById.get(r.reporter_user_id) ?? null) : null,
    target_label:
      r.target_type === 'gig'
        ? (gigTitleById.get(r.target_id) ?? null)
        : r.target_type === 'artist_profile'
          ? (artistNameById.get(r.target_id) ?? null)
          : null,
  }))
}

export async function setReportStatus(
  input: { reportId: string; status: 'reviewed' | 'dismissed' | 'actioned' },
  session: AdminSession,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('marketplace_reports')
    .update({
      status: input.status,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.reportId)
  await recordAuditEvent({
    action: `admin.marketplace.report_${input.status}`,
    targetType: 'marketplace_report',
    targetId: input.reportId,
    session,
  })
}

/** Remove a gig from the board (status 'removed'; the row survives for audit). */
export async function removeGig(
  input: { gigId: string; reason: string },
  session: AdminSession,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('gigs')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', input.gigId)
  await recordAuditEvent({
    action: 'admin.marketplace.gig_removed',
    targetType: 'gig',
    targetId: input.gigId,
    metadata: { reason: input.reason },
    session,
  })
}
