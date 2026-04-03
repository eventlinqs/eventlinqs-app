import { createClient } from '@/lib/supabase/client'

export async function uploadEventImage(
  file: File,
  userId: string,
  eventId: string
): Promise<string | null> {
  const supabase = createClient()
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${eventId}/${Date.now()}.${fileExt}`

  const { error } = await supabase.storage
    .from('event-images')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data } = supabase.storage
    .from('event-images')
    .getPublicUrl(fileName)

  return data.publicUrl
}
