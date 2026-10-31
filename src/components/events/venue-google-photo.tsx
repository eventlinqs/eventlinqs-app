'use client'

import { useEffect, useState } from 'react'

/**
 * A VENUE's GOOGLE PHOTO ON ITS EVENT PAGE, WITH THE CREDIT GOOGLE REQUIRES (directive of 31 October 17:44, sections 5
 * to 7; Lawal's ruling of 30 October 23:56: event detail pages only, never list cards). Shown only for a night with no
 * photograph of its own, in the getting-there section, never as the hero: the hero stays the page's one server-drawn
 * image (the LCP law), and a Google photo may not be drawn into a cached page or our image optimiser ('You cannot
 * cache a photo name'; Places content may not be cached: places/web-service/place-photos and policies, read
 * 31 October 2026). So it is asked for in the visitor's browser, afresh, from /api/venues/<id>/google-photo, and
 * appears only when Google gives one; otherwise nothing is drawn. The author is credited, linked, with 'Google Maps'
 * ('You must always credit the author when displaying photos'; off a map, 'the text Google Maps is acceptable').
 */

type Photo = { uri: string; widthPx: number; heightPx: number; authors: { displayName: string; uri: string | null }[] }

export function VenueGooglePhoto({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [photo, setPhoto] = useState<Photo | null>(null)
  useEffect(() => {
    let live = true
    const width = Math.min(1600, Math.round((window.innerWidth || 800) * (window.devicePixelRatio || 1)))
    fetch(`/api/venues/${venueId}/google-photo?w=${width}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { photo?: Photo | null } | null) => {
        if (live && j?.photo) setPhoto(j.photo)
      })
      // A failed or refused look (no key, the day's quota reached, Google down) leaves the section as it was: no photo
      // is the honest answer, and the route has already said why in its own response.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [venueId])
  if (!photo) return null
  return (
    <figure data-venue-google-photo className="mt-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- a Google photo may not pass through our image optimiser, which would cache it (Google's terms) */}
      <img src={photo.uri} alt={`${venueName}, as photographed on Google Maps`} className="aspect-[16/9] w-full rounded-xl object-cover" loading="lazy" />
      <figcaption className="mt-1 text-xs text-ink-600">
        Photo:{' '}
        {photo.authors.map((a, i) => (
          <span key={`${a.displayName}-${i}`}>
            {i > 0 ? ', ' : ''}
            {a.uri ? (
              <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {a.displayName}
              </a>
            ) : (
              a.displayName
            )}
          </span>
        ))}{' '}
        via Google Maps
      </figcaption>
    </figure>
  )
}
