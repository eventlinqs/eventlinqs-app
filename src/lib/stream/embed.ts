/**
 * WHAT KIND OF STREAM LINK IS THIS, AND HOW IS IT SHOWN (Scope v5, 3.11).
 *
 * The scope names four sources: "YouTube Live, Zoom, StreamYard, or custom
 * RTMP". Each is rendered differently and the difference is the whole point:
 *
 *   youtube / vimeo   embedded on the watch page through the same allowlisted
 *                     embed parser the event video uses (never a raw iframe
 *                     from a pasted string, which is a stored-XSS vector).
 *   zoom / streamyard a meeting, which runs in its own app or tab. The watch
 *                     page shows a large Open button and the address.
 *   rtmp              an ingest or playback address a streaming app opens; a
 *                     browser cannot. Shown with a copy control and a sentence
 *                     that says so, rather than a link that does nothing.
 *   link              any other https page: opened in a new tab.
 *
 * Pure: no I/O, so it is unit tested exhaustively and reused by the form
 * (validation on save) and the watch page (rendering).
 */
import { parseVideoEmbed } from '@/lib/media/video-embed'

export type StreamLinkKind = 'youtube' | 'vimeo' | 'zoom' | 'streamyard' | 'rtmp' | 'link'

export type ClassifiedStreamLink =
  | { ok: true; kind: 'youtube' | 'vimeo'; url: string; embedUrl: string; label: string }
  | { ok: true; kind: 'zoom' | 'streamyard' | 'link'; url: string; label: string }
  | { ok: true; kind: 'rtmp'; url: string; label: string }
  | { ok: false; error: string }

export const STREAM_LINK_MAX_LENGTH = 2048

const REJECT =
  'Paste the link your viewers will open: a YouTube Live or Vimeo link, a Zoom or StreamYard link, any https page, or an rtmp address.'

function looksLikeMarkup(input: string): boolean {
  return /[<>]|iframe|<script|javascript:|data:|on\w+\s*=/i.test(input)
}

/** The rule the form and the database share: https, http or rtmp(s), no markup, bounded. */
export function isAcceptableStreamLink(input: string | null | undefined): boolean {
  const raw = (input ?? '').trim()
  if (!raw || raw.length > STREAM_LINK_MAX_LENGTH) return false
  if (looksLikeMarkup(raw)) return false
  return /^(https?|rtmps?):\/\/\S+$/i.test(raw)
}

export function classifyStreamLink(input: string | null | undefined): ClassifiedStreamLink {
  const raw = (input ?? '').trim()
  if (!isAcceptableStreamLink(raw)) return { ok: false, error: REJECT }

  if (/^rtmps?:\/\//i.test(raw)) {
    return { ok: true, kind: 'rtmp', url: raw, label: 'Custom RTMP stream' }
  }

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, error: REJECT }
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase()

  const embed = parseVideoEmbed(raw)
  if (embed.ok && embed.video.provider === 'youtube') {
    return { ok: true, kind: 'youtube', url: raw, embedUrl: embed.video.embedUrl, label: 'YouTube Live' }
  }
  if (embed.ok && embed.video.provider === 'vimeo') {
    return { ok: true, kind: 'vimeo', url: raw, embedUrl: embed.video.embedUrl, label: 'Vimeo' }
  }
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) {
    return { ok: true, kind: 'zoom', url: raw, label: 'Zoom' }
  }
  if (host === 'streamyard.com' || host.endsWith('.streamyard.com')) {
    return { ok: true, kind: 'streamyard', url: raw, label: 'StreamYard' }
  }
  return { ok: true, kind: 'link', url: raw, label: 'Livestream' }
}
