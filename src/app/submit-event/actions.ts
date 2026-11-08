'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'
import { judgeSubmission } from '@/lib/listings/submission'
import { recordSubmission, sentPhoto } from '@/lib/listings/submission-store'
import { readSubmissionChoices } from '@/lib/listings/submission-choices'
import { selfListSubmission, type SelfListingOutcome } from '@/lib/listings/self-listing-run'
import { alertArrival } from '@/lib/listings/submission-watch'

/**
 * THE SUBMISSION FORM (release checklist H1). Public and unauthenticated, because the organiser of an event sold
 * elsewhere has no EventLinqs account: held to the listing-submission rate limit by address before anything is read
 * or written; a filled hidden field (a form robot) is answered as if sent and writes nothing. What passes is one row
 * with its photo, checked at once against the organiser's own booking page (organiser self-listing, Lawal's rulings of
 * 8 November 2026, 07:01 and 07:05): live when the page bears it out, held for a person when it cannot be verified. A
 * check that fails to finish leaves the row waiting, and the hourly listings run takes it. Works with no script.
 */
export async function submitEvent(formData: FormData): Promise<void> {
  const field = (name: string) => String(formData.get(name) ?? '')
  const back = (query: string) => redirect(`/submit-event?${query}#submit`)
  const policy = POLICIES['listing-submission']
  const ip = clientIp(new Request(getSiteUrl(), { headers: await headers() }))
  const rl = await checkRateLimit({ key: `${policy.keyPrefix}:${ip}`, limit: policy.limit, windowSec: policy.windowSec })
  if (!rl.ok) back(`problem=${encodeURIComponent('Too many events sent from here just now. Wait a few minutes and try again.')}`)
  if (field('website') !== '') back('sent=1')

  const choices = await readSubmissionChoices()
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
      category: field('category'),
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
    choices.context,
  )
  if (!judged.ok) back(`problem=${encodeURIComponent(judged.problem)}`)
  else {
    const photo = formData.get('photo')
    const done = await recordSubmission(createAdminClient(), judged.row, photo instanceof File ? photo : null)
    if (done.state === 'refused') back(`problem=${encodeURIComponent(done.reason)}`)
    else {
      // The PM's 15:00 of 8 November 2026: Lawal hears of every submission the moment it arrives, before its checks run,
      // so a check that never finishes can never hide one (src/lib/listings/submission-watch.ts).
      try {
        await alertArrival(done.id)
      } catch (err) {
        console.error('[submit-event] the arrival alert was not sent; the hourly backstop still raises it:', err instanceof Error ? err.message : String(err))
      }
      let outcome: SelfListingOutcome | null = null
      try {
        outcome = await selfListSubmission(done.id)
      } catch (err) {
        console.error('[submit-event] the self-listing check did not finish; the hourly run takes it:', err instanceof Error ? err.message : String(err))
      }
      if (outcome?.state === 'published') back(`sent=1&live=${encodeURIComponent(outcome.slug)}`)
      if (outcome?.state === 'held') back('sent=1&held=1')
      back('sent=1')
    }
  }
}
