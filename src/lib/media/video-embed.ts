// Video embed parser - the ONLY way an organiser video URL becomes a renderable
// embed. SPEC 1.4 / Security: one video per event, embed by ALLOWLISTED provider
// URL (YouTube, Vimeo, Instagram, TikTok), parsed to a canonical embed on the
// SERVER. A raw user iframe or pasted HTML is NEVER accepted (stored-XSS vector).
//
// This module is pure (no I/O) so it is unit-tested in isolation and reused by
// both the persist path (validate on save) and any display narrowing.

import { VIDEO_PROVIDERS, type VideoProvider } from './limits'

export type ParsedVideo = {
  provider: VideoProvider
  /** Canonical, sandboxable iframe src on a provider-controlled host. */
  embedUrl: string
  /** Provider video id / shortcode (for reference and dedupe). */
  id: string
}

export type VideoParseResult =
  | { ok: true; video: ParsedVideo }
  | { ok: false; error: string }

const FRIENDLY_REJECT =
  'Paste a video link from YouTube, Vimeo, Instagram, or TikTok. Raw embed code and other sites are not supported.'

// Anything that looks like markup or a script URL is refused outright, before we
// even try to parse a host. This is the raw-iframe / pasted-HTML guard.
function looksLikeMarkup(input: string): boolean {
  return /[<>]|iframe|<script|javascript:|data:|on\w+\s*=/i.test(input)
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return /^[\w-]{11}$/.test(id) ? id : null
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v') ?? ''
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([\w-]{11})/)
    if (m) return m[1]
  }
  return null
}

function vimeoId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '')
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
  // vimeo.com/123456789  or  player.vimeo.com/video/123456789
  const m = u.pathname.match(/(?:^|\/video\/)\/?(\d{6,})/)
  if (m) return m[1]
  const first = u.pathname.split('/').filter(Boolean)[0] ?? ''
  return /^\d{6,}$/.test(first) ? first : null
}

function instagramCode(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '')
  if (host !== 'instagram.com' && host !== 'instagr.am') return null
  // /p/{code}/  |  /reel/{code}/  |  /tv/{code}/
  const m = u.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)/)
  return m ? m[1] : null
}

function tiktokId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '')
  if (host !== 'tiktok.com' && host !== 'm.tiktok.com') return null
  // /@user/video/{digits}  (canonical, fully resolvable to an embed)
  const m = u.pathname.match(/\/video\/(\d{6,})/)
  return m ? m[1] : null
}

/**
 * Parse a raw organiser-supplied string into a canonical, allowlisted embed.
 * Returns a friendly rejection for markup, non-allowlisted hosts, or links we
 * cannot resolve to a stable embed (e.g. short-links that need a network hop).
 */
export function parseVideoEmbed(input: string | null | undefined): VideoParseResult {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, error: 'Enter a video link.' }
  if (looksLikeMarkup(raw)) return { ok: false, error: FRIENDLY_REJECT }

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, error: FRIENDLY_REJECT }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, error: FRIENDLY_REJECT }
  }

  const yt = youtubeId(u)
  if (yt) {
    return { ok: true, video: { provider: 'youtube', id: yt, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` } }
  }
  const vi = vimeoId(u)
  if (vi) {
    return { ok: true, video: { provider: 'vimeo', id: vi, embedUrl: `https://player.vimeo.com/video/${vi}` } }
  }
  const ig = instagramCode(u)
  if (ig) {
    return { ok: true, video: { provider: 'instagram', id: ig, embedUrl: `https://www.instagram.com/p/${ig}/embed` } }
  }
  const tt = tiktokId(u)
  if (tt) {
    return { ok: true, video: { provider: 'tiktok', id: tt, embedUrl: `https://www.tiktok.com/embed/v2/${tt}` } }
  }

  return { ok: false, error: FRIENDLY_REJECT }
}

/** Type guard for a stored provider string read back from the DB. */
export function isVideoProvider(value: unknown): value is VideoProvider {
  return typeof value === 'string' && (VIDEO_PROVIDERS as readonly string[]).includes(value)
}
