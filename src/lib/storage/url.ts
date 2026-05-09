/**
 * Storage URL generation for EventLinqs (Batch 10).
 *
 * All user-facing storage URLs MUST go through this module. Never
 * concatenate `NEXT_PUBLIC_SUPABASE_URL` directly with a storage path
 * because that leaks the Supabase project domain to users (parity gap
 * vs Eventbrite img.evbuc.com / Ticketmaster s1.ticketm.net / DICE
 * dice-media.imgix.net / Airbnb a0.muscache.com).
 *
 * Rollout pattern:
 *   1. Set NEXT_PUBLIC_STORAGE_DOMAIN to `images.eventlinqs.com` once
 *      the custom domain is configured on Supabase Storage and DNS
 *      resolves.
 *   2. Until then, this module falls back to the Supabase project
 *      domain so the platform works in dev and staging.
 *   3. After flip, every URL on the platform reads images.eventlinqs.com.
 *
 * Both functions are pure. The env var lookup happens at call time so
 * the runtime branded-domain flip does not require redeploy of the
 * client bundle (Vercel surfaces the new env var on next request).
 */

function readSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL
}

function readBrandedDomain(): string | undefined {
  const v = process.env.NEXT_PUBLIC_STORAGE_DOMAIN
  if (!v) return undefined
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Generate a public URL for a storage object.
 *
 * @param bucket - storage bucket name (e.g. 'event-images', 'organiser-logos')
 * @param path   - path within the bucket (e.g. 'sydney-mardi-gras/cover.jpg')
 * @returns user-facing URL using the branded domain when configured,
 *          else the Supabase storage URL pattern.
 */
export function getStorageUrl(bucket: string, path: string): string {
  if (typeof bucket !== 'string' || bucket.length === 0) {
    throw new Error('[storage/url] bucket is required')
  }
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('[storage/url] path is required')
  }
  // Strip leading slash on path so `/foo` and `foo` produce the same URL.
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  const branded = readBrandedDomain()
  if (branded) {
    return `https://${branded}/${bucket}/${cleanPath}`
  }
  const supabaseUrl = readSupabaseUrl()
  if (!supabaseUrl) {
    throw new Error('[storage/url] NEXT_PUBLIC_SUPABASE_URL is required when NEXT_PUBLIC_STORAGE_DOMAIN is not set')
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`
}

/**
 * Rewrite an existing Supabase URL to use the branded domain.
 *
 * Used for in-flight URL rewriting where a legacy Supabase URL sits in
 * the database (or external DOM) and the surrounding render path wants
 * to surface the branded form. Identity when no branded domain is
 * configured. Identity for non-Supabase URLs (e.g. Pexels, picsum,
 * already-branded URLs).
 */
export function rewriteStorageUrl(url: string): string {
  if (typeof url !== 'string' || url.length === 0) return url
  const branded = readBrandedDomain()
  if (!branded) return url
  const supabaseUrl = readSupabaseUrl()
  if (!supabaseUrl) return url
  const supabasePrefix = `${supabaseUrl}/storage/v1/object/public/`
  if (url.startsWith(supabasePrefix)) {
    const tail = url.slice(supabasePrefix.length)
    return `https://${branded}/${tail}`
  }
  return url
}

/**
 * Test helper: returns the active storage domain hostname for assertions.
 */
export function getActiveStorageDomain(): string {
  const branded = readBrandedDomain()
  if (branded) return branded
  const supabaseUrl = readSupabaseUrl()
  if (!supabaseUrl) return ''
  try {
    return new URL(supabaseUrl).hostname
  } catch {
    return ''
  }
}
