'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { mediaDeps } from '@/lib/listings/organiser-media'
import { givePhotos, readPhotoPage } from '@/lib/listings/photo-permission'
import { ONE_TICK_USES } from '@/lib/listings/photo-permission-math'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateEventSurfacesById } from '@/lib/events/revalidate-event'

/**
 * THE PHOTO PAGE'S ONE PRESS (src/lib/listings/photo-permission.ts): the link is checked again, the press is limited by
 * the visitor's address (policies.ts photo-permission), the one tick is read (Lawal, 13:49 of 23 November 2026: "One
 * tick, one checkbox"), and the yes and the images are recorded and applied automatically for that night (Lawal,
 * 18 November 2026, 13:46; photo-permission.ts). It answers on the same page.
 */
export async function givePhotosAction(formData: FormData): Promise<void> {
  const contact = String(formData.get('contact') ?? '')
  const proof = String(formData.get('proof') ?? '')
  const here = `/photos/${encodeURIComponent(contact)}/${encodeURIComponent(proof)}`
  const back = (key: 'sent' | 'problem', said: string): never => redirect(`${here}?${key}=${encodeURIComponent(said)}#photos`)

  const policy = POLICIES['photo-permission']
  const ip = clientIp(new Request(getSiteUrl(), { headers: await headers() }))
  const rl = await checkRateLimit({ key: `${policy.keyPrefix}:${ip}`, limit: policy.limit, windowSec: policy.windowSec })
  if (!rl.ok) back('problem', 'A few photos were added just now. Try again in ten minutes.')

  const db = createAdminClient()
  const now = new Date()
  const page = await readPhotoPage(db, contact, proof, now)
  if (page.state !== 'found') redirect('/')
  const found = page as Extract<typeof page, { state: 'found' }>

  // ONE TICK IS THE WHOLE GRANT: its words are the page's (ONE_TICK_WORDS), its uses ONE_TICK_USES.
  if (formData.get('rights') !== 'yes') back('problem', 'Tick the box to say EventLinqs may use them.')
  const givenBy = String(formData.get('given_by') ?? '').trim()
  if (givenBy.length < 2 || givenBy.length > 120) back('problem', 'Write your name, as the person giving permission.')
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File)

  // The PM's 23:38 of 18 November 2026: a flyer is kept as artwork (the organiser spotlight), else as a photograph.
  const kind = formData.get('kind') === 'flyer' ? 'flyer' : 'photo'
  // 'gallery': the photo page judges a photo by the event page's own box, not the wizard's cover width (the PM's 09:45 of
  // 19 November 2026, item 1 (c); photo-permission.ts).
  const done = await givePhotos(db, { page: found, eventId: String(formData.get('night') ?? ''), files, givenBy, now, kind }, mediaDeps('gallery'))
  await recordAnonAuditEvent({
    action: 'public.photos.given',
    metadata: { contactId: found.contactId, eventId: String(formData.get('night') ?? ''), uses: ONE_TICK_USES, state: done.state, added: done.state === 'done' ? done.added : 0 },
  })
  if (done.state === 'refused') back('problem', done.reason)
  const d = done as Extract<typeof done, { state: 'done' }>
  if (d.added === 0) back('problem', d.refused.join(' '))
  // EVERY SURFACE OF THE NIGHT, REFRESHED WHENEVER A PHOTO WAS WRITTEN (T5, 20 November 2026): the night's page kept its
  // render from before the upload (X-Vercel-Cache STALE, Age 1555) while the organiser read 'now on your event'. The
  // platform's one event refresh, never a bare path gated on the cover (the 18 August 2026 defect's shape): its paths,
  // and its data caches expired at once (updateTag, read-your-own-writes; src/lib/events/revalidate-event.ts).
  if (d.added > 0) await revalidateEventSurfacesById(db as never, String(formData.get('night') ?? ''))
  // The words say only what is true (Lawal, 13:46: no person named, no review promised): applied to the event page, or
  // (if an approval could not be written) kept, never 'now on your event' when it is not.
  const what = d.added === 1 ? 'photo is' : 'photos are'
  const said = d.applied === 0
    ? `Thank you. Your ${what} with us.`
    : d.coverSet
      ? `Thank you. Your ${what} now on your event.`
      : `Thank you. Your ${what} now with your event.`
  back('sent', `${said}${d.refused.length > 0 ? ` Not added: ${d.refused.join(' ')}` : ''}`)
}
