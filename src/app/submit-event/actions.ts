'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'
import { judgeSubmission } from '@/lib/listings/submission'
import { recordSubmission, sentPhoto } from '@/lib/listings/submission-store'

/**
 * THE SUBMISSION FORM (release checklist H1). Public and unauthenticated, because the organiser of an event sold
 * elsewhere has no EventLinqs account: held to the listing-submission rate limit by address before anything is read
 * or written; a filled hidden field (a form robot) is answered as if sent and writes nothing. What passes is one row
 * in the review queue (/admin/submissions) with its photo; nothing is published from here. Works with no script.
 */
export async function submitEvent(formData: FormData): Promise<void> {
  const field = (name: string) => String(formData.get(name) ?? '')
  const back = (query: string) => redirect(`/submit-event?${query}#submit`)
  const policy = POLICIES['listing-submission']
  const ip = clientIp(new Request(getSiteUrl(), { headers: await headers() }))
  const rl = await checkRateLimit({ key: `${policy.keyPrefix}:${ip}`, limit: policy.limit, windowSec: policy.windowSec })
  if (!rl.ok) back(`problem=${encodeURIComponent('Too many events sent from here just now. Wait a few minutes and try again.')}`)
  if (field('website') !== '') back('sent=1')

  const judged = judgeSubmission(
    {
      name: field('name'),
      email: field('email'),
      role: field('role'),
      title: field('title'),
      startsLocal: field('starts'),
      endsLocal: field('ends'),
      venueName: field('venue_name'),
      venueAddress: field('venue_address'),
      city: field('city'),
      bookingUrl: field('booking_url'),
      entry: field('entry'),
      price: field('price'),
      description: field('description'),
      hasPhoto: sentPhoto(formData.get('photo')),
      photoOwned: field('photo_owned') === 'yes',
      authority: field('authority') === 'yes',
      permission: field('permission') === 'yes',
    },
    new Date(),
  )
  if (!judged.ok) back(`problem=${encodeURIComponent(judged.problem)}`)
  else {
    const photo = formData.get('photo')
    const done = await recordSubmission(createAdminClient(), judged.row, photo instanceof File ? photo : null)
    if (done.state === 'refused') back(`problem=${encodeURIComponent(done.reason)}`)
    back('sent=1')
  }
}
