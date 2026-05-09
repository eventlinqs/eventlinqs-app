'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { rewriteStorageUrl } from '@/lib/storage/url'

/**
 * Server action for image uploads.
 * Uses the admin (service-role) client to bypass the browser auth lock
 * issue in dev mode, while still verifying the user's identity server-side.
 */
export async function uploadEventImage(formData: FormData): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const file = formData.get('file') as File | null
  const eventId = formData.get('eventId') as string | null
  if (!file || !eventId) return null

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.id}/${eventId}/${Date.now()}.${fileExt}`

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('event-images')
    .upload(fileName, file, { cacheControl: '3600', upsert: false })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  // getPublicUrl returns the Supabase project domain. rewriteStorageUrl
  // swaps to the branded `images.eventlinqs.com` domain when the
  // NEXT_PUBLIC_STORAGE_DOMAIN env var is configured (Batch 10), so no
  // user-facing URL ever leaks the Supabase project hostname.
  const { data } = admin.storage.from('event-images').getPublicUrl(fileName)
  return rewriteStorageUrl(data.publicUrl)
}
