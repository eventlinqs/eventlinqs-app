'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'
import { judgeRemovalRequest, recordRemovalRequest } from '@/lib/listings/removal-request'
import { reportableEvent } from './reportable'

/**
 * REPORT OR REMOVE THIS LISTING (the release checklist's I5). Public and unauthenticated, because the person who
 * reports a night is most often its organiser or a visitor with no EventLinqs account: held to the listing-report
 * rate limit by address before anything is read or written; a filled hidden field (a form robot) is answered as if
 * sent and writes nothing. What passes is one removal_requests row naming the night, for a person in /admin/today;
 * nothing is hidden or deleted from here. Works with no script.
 */
export async function reportListing(formData: FormData): Promise<void> {
  const field = (name: string) => String(formData.get(name) ?? '')
  const slug = field('slug')
  const back = (query: string) => redirect(`/events/${encodeURIComponent(slug)}/report?${query}#report`)
  const policy = POLICIES['listing-report']
  const ip = clientIp(new Request(getSiteUrl(), { headers: await headers() }))
  const rl = await checkRateLimit({ key: `${policy.keyPrefix}:${ip}`, limit: policy.limit, windowSec: policy.windowSec })
  if (!rl.ok) back(`problem=${encodeURIComponent('Too many reports sent from here just now. Wait a few minutes and try again.')}`)
  if (field('website') !== '') back('sent=1')

  const judged = judgeRemovalRequest({ reason: field('reason'), email: field('email') })
  if (!judged.ok) back(`problem=${encodeURIComponent(judged.problem)}`)
  else {
    const admin = createAdminClient()
    const event = await reportableEvent(admin, slug)
    if (!event) redirect('/events')
    const done = await recordRemovalRequest(admin, event.id, judged)
    if (done.state === 'refused') back(`problem=${encodeURIComponent(done.reason)}`)
    back('sent=1')
  }
}
