/**
 * Image source guard for the media library (docs/MEDIA-ARCHITECTURE.md).
 *
 * `next/image` throws at render time when a src host is not in next.config
 * `images.remotePatterns`. That render-time throw 500s the entire page or
 * rail - one event with a bad cover URL must never do that. Every media
 * surface runs its src through `resolveImageSrc` and renders a placeholder
 * when it returns null, so a single bad, missing, or disallowed URL degrades
 * to a clean fallback instead of taking the page down.
 *
 * It also recovers dead branded-domain storage URLs. While
 * NEXT_PUBLIC_STORAGE_DOMAIN pointed at a branded domain that serves nothing,
 * uploads were written as `https://<branded>/cdn/<bucket>/<path>`. Those are
 * rewritten back to the working Supabase storage host so the real image still
 * renders - correct regardless of the env var.
 */

function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
}

function supabaseHost(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * Returns a renderable image src, or null when the URL is missing, malformed,
 * or points at a host next/image is not configured to load.
 */
export function resolveImageSrc(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // Local/static/data URLs are always renderable by next/image.
  if (trimmed.startsWith('/') || trimmed.startsWith('data:')) return trimmed

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const sbUrl = supabaseUrl()
  const sbHost = supabaseHost(sbUrl)

  // Recover dead branded-domain storage URLs
  // (https://<branded>/cdn/<bucket>/<path>) to the working Supabase host.
  if (sbHost && parsed.host !== sbHost && parsed.pathname.startsWith('/cdn/')) {
    const tail = parsed.pathname.slice('/cdn/'.length)
    if (tail) return `${sbUrl}/storage/v1/object/public/${tail}`
  }

  // Allow-list mirrors next.config.ts images.remotePatterns hostnames.
  const allowed = new Set(
    [sbHost, 'images.eventlinqs.com', 'picsum.photos', 'images.pexels.com'].filter(Boolean),
  )
  return allowed.has(parsed.host) ? trimmed : null
}
