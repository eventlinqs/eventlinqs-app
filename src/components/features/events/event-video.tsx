'use client'

import { useState } from 'react'
import { GalleryImage } from '@/components/media'
import type { VideoProvider } from '@/lib/media/limits'

// Event video, rendered BELOW the hero. A click-to-play FACADE: a raster poster
// (the event cover) plus a play button. The provider iframe is only inserted
// after the attendee clicks, so:
//   - the iframe never loads provider JS on first paint (Lighthouse stays green,
//     no third-party request, no LCP competition - the cover raster is the LCP)
//   - autoplay is gated behind an explicit user gesture (and disabled entirely in
//     headless audit mode, matching MEDIA-ARCHITECTURE §7)
// The embedUrl is the server-parsed, allowlisted provider URL; raw HTML never
// reaches this component.

const PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

type Props = {
  embedUrl: string
  provider: VideoProvider
  poster: string
  posterBlur?: string
  title: string
}

export function EventVideo({ embedUrl, provider, poster, posterBlur, title }: Props) {
  const [playing, setPlaying] = useState(false)

  // Autoplay only on a real user gesture, never in a headless audit run.
  const headless = typeof document !== 'undefined' && document.body.dataset.headless === '1'
  const src = headless ? embedUrl : `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-ink-200 bg-ink-900">
      {playing ? (
        <iframe
          src={src}
          title={`${title} video`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play the ${PROVIDER_LABEL[provider]} video for ${title}`}
          className="group absolute inset-0 h-full w-full"
        >
          <GalleryImage
            src={poster}
            alt=""
            blurDataURL={posterBlur}
            className="opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute inset-0 bg-ink-900/30" aria-hidden />
          <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
            <svg className="ml-1 h-7 w-7 text-ink-900" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-ink-900/80 px-3 py-1 text-xs font-semibold text-white">
            Watch on {PROVIDER_LABEL[provider]}
          </span>
        </button>
      )}
    </div>
  )
}
