'use client'

import { useCallback, useEffect, useState } from 'react'
import { GalleryImage } from '@/components/media'
import type { GalleryImage as GalleryItem } from '@/lib/media/event-media-model'

// Event gallery, rendered BELOW the hero on the event detail page. Each tile is a
// real <button> that opens a lightbox - satisfying the affordance law (no
// dead-end tiles) and giving the attendee a proper full-size view. Thumbnails are
// lazy with a blur placeholder, so the gallery never competes with the hero LCP.

type Props = {
  images: GalleryItem[]
  eventTitle: string
}

export function EventGallery({ images, eventTitle }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const valid = images.filter((i) => i.url)

  const close = useCallback(() => setOpenIndex(null), [])
  const show = useCallback(
    (next: number) => setOpenIndex((cur) => (cur === null ? cur : (next + valid.length) % valid.length)),
    [valid.length],
  )

  if (valid.length === 0) return null

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {valid.map((img, i) => (
          <li key={`${img.url}-${i}`}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`View image ${i + 1}${img.alt ? `: ${img.alt}` : ''}`}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-100 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <GalleryImage
                src={img.url}
                alt={img.alt || `${eventTitle} photo ${i + 1}`}
                blurDataURL={img.blur}
                className="transition-transform duration-200 group-hover:scale-[1.03]"
              />
            </button>
          </li>
        ))}
      </ul>

      {openIndex !== null && valid[openIndex] && (
        <Lightbox
          image={valid[openIndex]}
          index={openIndex}
          total={valid.length}
          eventTitle={eventTitle}
          onClose={close}
          onPrev={() => show(openIndex - 1)}
          onNext={() => show(openIndex + 1)}
        />
      )}
    </div>
  )
}

function Lightbox({
  image,
  index,
  total,
  eventTitle,
  onClose,
  onPrev,
  onNext,
}: {
  image: GalleryItem
  index: number
  total: number
  eventTitle: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, onPrev, onNext])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${total}`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPrev() }}
            aria-label="Previous image"
            className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNext() }}
            aria-label="Next image"
            className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      <div className="relative max-h-[85vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {/* The lightbox view is a transient full-size raster. next/image cannot be
            used in this fixed overlay without a sized fill parent + sizes; a plain
            img is correct here and is not a card/tile in a grid. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- full-size lightbox view, not a grid/rail tile */}
        <img
          src={image.url}
          alt={image.alt || `${eventTitle} image ${index + 1}`}
          className="mx-auto max-h-[85vh] w-auto rounded-lg object-contain"
        />
        {image.alt && <p className="mt-2 text-center text-sm text-white/80">{image.alt}</p>}
      </div>
    </div>
  )
}
