'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadEventImage } from '@/lib/upload'
import { parseVideoEmbed } from '@/lib/media/video-embed'
import {
  MAX_TOTAL_IMAGES,
  MAX_GALLERY_IMAGES,
  MAX_IMAGE_BYTES,
  MIN_COVER_WIDTH,
  IMAGE_ACCEPT_ATTR,
} from '@/lib/media/limits'

// One ordered list of up to 10 images. Index 0 is the COVER (the hero + card +
// LCP raster); indexes 1..9 are the gallery. The first image is the cover and is
// changeable by drag-reorder. This is the organiser-facing surface of the Event
// Media Standard; the real validation, EXIF strip, and storage live server-side
// in src/lib/upload.ts + src/lib/media/image-pipeline.ts.

export type MediaImage = {
  /** Stable client key. */
  id: string
  /** Remote storage URL (empty while uploading). */
  url: string
  alt: string
  blur?: string
  width: number
  height: number
  /** Object URL for instant preview while the upload round-trips. */
  localPreview?: string
  uploading: boolean
  error?: string
}

type Props = {
  eventId: string
  images: MediaImage[]
  onImagesChange: (images: MediaImage[]) => void
  video: string
  onVideoChange: (video: string) => void
}

function uid() {
  return crypto.randomUUID()
}

export function EventMediaStep({ eventId, images, onImagesChange, video, onVideoChange }: Props) {
  // Internal state is the source of truth so parallel uploads update individual
  // tiles without stale-closure races; the parent is notified on every change.
  const [items, setItems] = useState<MediaImage[]>(images)
  // Mirror the latest items for synchronous reads inside event handlers (slot
  // accounting during a multi-file drop), synced after commit - never in render.
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])
  const [notice, setNotice] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrls = useRef<Set<string>>(new Set())

  useEffect(() => {
    onImagesChange(items)
  }, [items, onImagesChange])

  // Revoke every object URL on unmount.
  useEffect(() => {
    const urls = objectUrls.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const patch = useCallback((id: string, change: Partial<MediaImage>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)))
  }, [])

  const uploadOne = useCallback(
    async (file: File, id: string, role: 'cover' | 'gallery') => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('eventId', eventId)
      fd.append('role', role)
      const result = await uploadEventImage(fd)
      if (result.ok) {
        patch(id, {
          url: result.image.url,
          blur: result.image.blur,
          width: result.image.width,
          height: result.image.height,
          uploading: false,
          error: undefined,
        })
      } else {
        // Drop the failed tile and surface the friendly server message.
        setItems((prev) => prev.filter((it) => it.id !== id))
        setNotice(result.error)
      }
    },
    [eventId, patch],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      setNotice(null)
      const current = itemsRef.current
      const remaining = MAX_TOTAL_IMAGES - current.length
      if (remaining <= 0) {
        setNotice(`You can add up to ${MAX_TOTAL_IMAGES} images (1 cover and ${MAX_GALLERY_IMAGES} more).`)
        return
      }
      const accepted = files.slice(0, remaining)
      if (files.length > remaining) {
        setNotice(
          `Only ${remaining} more image${remaining === 1 ? '' : 's'} can be added (limit ${MAX_TOTAL_IMAGES}). The extra file${files.length - remaining === 1 ? ' was' : 's were'} skipped.`,
        )
      }

      const newTiles: MediaImage[] = []
      accepted.forEach((file, idx) => {
        if (file.size > MAX_IMAGE_BYTES) {
          setNotice('Each image must be under 10MB.')
          return
        }
        const localPreview = URL.createObjectURL(file)
        objectUrls.current.add(localPreview)
        const id = uid()
        const isCover = current.length === 0 && idx === 0
        newTiles.push({ id, url: '', alt: '', width: 0, height: 0, localPreview, uploading: true })
        // The first image ever added is the cover (min-width enforced server-side);
        // everything else is a gallery image.
        void uploadOne(file, id, isCover ? 'cover' : 'gallery')
      })
      if (newTiles.length) setItems((prev) => [...prev, ...newTiles])
    },
    [uploadOne],
  )

  const onPick = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    addFiles(Array.from(fileList))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAt = (id: string) => {
    setNotice(null)
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const setAlt = (id: string, alt: string) => patch(id, { alt: alt.slice(0, 300) })

  // Drag reorder. Blocks moving an under-size image into the cover slot.
  const moveItem = (from: number, to: number) => {
    setNotice(null)
    setItems((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      const cover = next[0]
      if (cover && cover.width > 0 && cover.width < MIN_COVER_WIDTH) {
        setNotice(
          `That image is too small to be the cover (${cover.width}px wide). Use one at least ${MIN_COVER_WIDTH}px wide, or keep it in the gallery.`,
        )
        return prev
      }
      return next
    })
  }

  const total = items.length
  const ready = items.filter((i) => !i.uploading && i.url)
  const cover = items[0]
  const videoState = video.trim() ? parseVideoEmbed(video) : null

  return (
    <div className="space-y-6">
      {/* Cover dual-crop preview: the organiser sees how the cover reads in BOTH
          the full-bleed hero AND the event card, so it is authored for both. */}
      {cover && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink-600">Cover preview</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
            <figure>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                <CoverImg item={cover} />
              </div>
              <figcaption className="mt-1 text-center text-[11px] text-ink-400">Hero crop (16:9)</figcaption>
            </figure>
            <figure>
              <div className="relative mx-auto aspect-[4/5] w-full max-w-[180px] overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                <CoverImg item={cover} />
              </div>
              <figcaption className="mt-1 text-center text-[11px] text-ink-400">Card crop (4:5)</figcaption>
            </figure>
          </div>
        </div>
      )}

      {/* Image grid + drag reorder */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-ink-600">Images</label>
          <span className="text-xs text-ink-400">
            {total} of {MAX_TOTAL_IMAGES} | 1 cover + up to {MAX_GALLERY_IMAGES} more
          </span>
        </div>

        {total > 0 && (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it, index) => (
              <li
                key={it.id}
                draggable={!it.uploading}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null) moveItem(dragIndex, index)
                  setDragIndex(null)
                }}
                className={`group relative rounded-lg border ${index === 0 ? 'border-gold-400' : 'border-ink-200'} bg-white p-2 ${it.uploading ? '' : 'cursor-grab'}`}
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-md bg-ink-100">
                  <CoverImg item={it} />
                  {it.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-ink-900/30">
                      <span className="rounded-md bg-ink-900/80 px-2 py-0.5 text-[11px] font-medium text-white">Uploading...</span>
                    </div>
                  )}
                  {index === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-900">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(it.id)}
                    aria-label="Remove image"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900/70 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={it.alt}
                  onChange={(e) => setAlt(it.id, e.target.value)}
                  placeholder="Describe this image"
                  aria-label={`Alt text for image ${index + 1}`}
                  className="mt-2 w-full rounded-md border border-ink-200 px-2 py-1 text-xs focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
                {index > 0 && !it.uploading && (
                  <button
                    type="button"
                    onClick={() => moveItem(index, 0)}
                    className="mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:border-gold-400 hover:text-gold-600"
                  >
                    Make cover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {total < MAX_TOTAL_IMAGES && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              onPick(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
              dragOver ? 'border-gold-400 bg-gold-100' : 'border-ink-200 hover:border-ink-400 hover:bg-ink-100'
            }`}
          >
            <svg className="mb-2 h-8 w-8 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-ink-600">
              <span className="font-medium text-gold-500">{total === 0 ? 'Add a cover' : 'Add images'}</span> or drag and drop
            </p>
            <p className="mt-1 text-xs text-ink-400">JPEG, PNG, WebP, AVIF, or HEIC. Up to 10MB each. The first image is your cover.</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />

        {notice && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</div>
        )}
      </div>

      {/* Video (one per event, embed by allowlisted provider link) */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-600">
          Event video
          <span className="ml-2 text-xs text-ink-400">Optional. One link from YouTube, Vimeo, Instagram, or TikTok.</span>
        </label>
        <input
          type="url"
          value={video}
          onChange={(e) => onVideoChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
        {videoState && videoState.ok && (
          <p className="mt-1.5 text-xs text-emerald-700">
            {capitalise(videoState.video.provider)} video linked. It will show below the hero on your event page.
          </p>
        )}
        {videoState && !videoState.ok && (
          <p className="mt-1.5 text-xs text-red-600">{videoState.error}</p>
        )}
      </div>

      {ready.length > 0 && (
        <p className="text-xs text-ink-400">
          {ready.length} image{ready.length === 1 ? '' : 's'} ready. The cover is required before you can publish.
        </p>
      )}
    </div>
  )
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Uploader preview. This is a PRIVATE dashboard authoring surface, not a public
// render surface, so a raw <img> preview is correct (the local blob cannot be
// optimised by next/image, and the remote preview is transient). The public event
// page renders the same media through the media component library (HeroMedia,
// GalleryImage). The src is either an object URL or our own storage host.
function CoverImg({ item }: { item: MediaImage }) {
  const src = item.localPreview && (item.uploading || !item.url) ? item.localPreview : item.url
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element -- transient organiser-uploader preview (blob or own-host), not a public render surface
    <img src={src} alt={item.alt || 'Event image preview'} className="absolute inset-0 h-full w-full object-cover" />
  )
}
