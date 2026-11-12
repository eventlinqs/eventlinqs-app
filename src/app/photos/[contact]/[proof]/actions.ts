'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { mediaDeps } from '@/lib/listings/organiser-media'
import { givePhotos, readPhotoPage } from '@/lib/listings/photo-permission'
import { usesFrom } from '@/lib/listings/photo-permission-math'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE PHOTO PAGE'S ONE PRESS (src/lib/listings/photo-permission.ts): the link is checked again, the press is limited by
 * the visitor's address (policies.ts photo-permission), the choices are read, and the yes and the images are recorded,
 * every image pending Lawal's approval. It answers on the same page. Nothing here is published.
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

  const uses = usesFrom(formData.get('on_page') === 'yes', formData.get('in_posts') === 'yes')
  if (uses === null) back('problem', 'Choose at least one place EventLinqs may use them.')
  if (formData.get('rights') !== 'yes') back('problem', 'Tick that you took them or have the right to share them.')
  const givenBy = String(formData.get('given_by') ?? '').trim()
  if (givenBy.length < 2 || givenBy.length > 120) back('problem', 'Write your name, as the person giving permission.')
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File)

  const done = await givePhotos(db, { page: found, eventId: String(formData.get('night') ?? ''), files, uses: uses as NonNullable<typeof uses>, givenBy, now }, mediaDeps())
  await recordAnonAuditEvent({
    action: 'public.photos.given',
    metadata: { contactId: found.contactId, eventId: String(formData.get('night') ?? ''), uses, state: done.state, added: done.state === 'done' ? done.added : 0 },
  })
  if (done.state === 'refused') back('problem', done.reason)
  const d = done as Extract<typeof done, { state: 'done' }>
  if (d.added === 0) back('problem', d.refused.join(' '))
  back('sent', `${d.added === 1 ? 'Your photo is' : `Your ${d.added} photos are`} with us. Lawal looks at each one before it is used, only where you chose.${d.refused.length > 0 ? ` Not added: ${d.refused.join(' ')}` : ''}`)
}
