import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLATFORM_TIME_ZONE, toZonedInputValue } from '@/lib/dates/event-time'
import { readSocialReport } from '@/lib/growth/social-report'
import { decideAction, enterFigureAction } from './actions'
import { SocialReportView } from './report-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Weekly social report | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * THE WEEKLY SOCIAL REPORT (the release checklist of 28 October 2026, J16 and J17; G1 to G5; K14). Staff only: order
 * value sits here, so the page asks for the growth page's two capabilities. The rows are read by
 * src/lib/growth/social-report.ts and counted by social-report-math.ts; ./report-view.tsx draws them.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AdminSocialReportPage({ searchParams }: { searchParams: Promise<{ campaign?: string; said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage') || !can(session, 'admin.pricing.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.growth.social_report.view', session })

  const sp = await searchParams
  const campaignId = typeof sp.campaign === 'string' && UUID.test(sp.campaign) ? sp.campaign : null
  const said = typeof sp.said === 'string' ? sp.said.slice(0, 400) : null
  const now = new Date()
  const page = await readSocialReport(createAdminClient(), { campaignId, now })

  return (
    <SocialReportView
      page={page}
      said={said}
      readAtDefault={toZonedInputValue(now.toISOString(), PLATFORM_TIME_ZONE)}
      enterFigure={enterFigureAction}
      decide={decideAction}
    />
  )
}
