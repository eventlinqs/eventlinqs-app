'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'
import { recordEnquiry } from '@/lib/partners/partners'

/**
 * THE PARTNER ENQUIRY FORM (Train C, row 14). Public and unauthenticated, so it is held to the partner-enquiry rate
 * limit by address before anything is written; the enquiry is one row in the admin queue (/admin/partners) and the
 * page says it arrived. Works with no script: a plain form post.
 */
export async function sendPartnerEnquiry(formData: FormData): Promise<void> {
  const field = (name: string) => String(formData.get(name) ?? '')
  const back = (query: string) => redirect(`/partners?${query}#enquire`)
  const policy = POLICIES['partner-enquiry']
  const ip = clientIp(new Request(getSiteUrl(), { headers: await headers() }))
  const rl = await checkRateLimit({ key: `${policy.keyPrefix}:${ip}`, limit: policy.limit, windowSec: policy.windowSec })
  if (!rl.ok) back(`problem=${encodeURIComponent('Too many enquiries from here just now. Wait a few minutes and try again.')}`)
  const done = await recordEnquiry(createAdminClient(), {
    name: field('name'),
    email: field('email'),
    organisation: field('organisation'),
    kind: field('kind'),
    message: field('message'),
  })
  if (done.state === 'refused') back(`problem=${encodeURIComponent(done.reason)}`)
  back('sent=1')
}
