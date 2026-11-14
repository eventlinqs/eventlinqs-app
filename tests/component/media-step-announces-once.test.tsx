/**
 * THE MEDIA STEP TELLS ITS FORM ABOUT ITS IMAGES ONCE PER CHANGE (14 November 2026).
 *
 * The create event form passes the media step a new handler on every render
 * (onImagesChange={imgs => set('media', imgs)}) and set() writes a new form object
 * every time. The step's effect listed that handler among its dependencies, so each
 * announcement re-rendered the form, which made a new handler, which ran the effect
 * again: React's "Maximum update depth exceeded" on the live form, and the whole
 * create form re-rendering without end while the media step was open. Found by the
 * sell first TEST proof (C:/dev/EVIDENCE/EL-14NOV/sell-first/e2e/browser.log).
 *
 * This holds the class with the form's own shape: a parent that keeps the images in
 * state, passes a fresh arrow each render and writes a new object each time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'

vi.mock('@/lib/upload', () => ({
  generateEventCoverPreview: vi.fn(),
  uploadEventImage: vi.fn(async () => ({
    ok: true,
    image: { url: 'https://example.com/uploaded-cover.jpg', blur: '', width: 1600, height: 900 },
  })),
}))
vi.mock('@/lib/media/client-compress', () => ({ prepareImageForUpload: vi.fn(async (f: File) => f) }))

import { EventMediaStep, type MediaImage } from '@/components/features/events/event-media-step'

const COVER: MediaImage = {
  id: 'cover-1',
  url: 'https://example.com/cover.jpg',
  alt: 'The stage',
  width: 1600,
  height: 900,
  uploading: false,
}

let parentRenders = 0
let announcements = 0
let latestMedia: MediaImage[] = []

function TheForm({ start = [COVER] }: { start?: MediaImage[] }) {
  parentRenders += 1
  const [form, setForm] = useState<{ media: MediaImage[]; video: string }>({ media: start, video: '' })
  latestMedia = form.media
  // exactly the form's shape: a new arrow every render, a new object every write
  return (
    <EventMediaStep
      eventId="e-1"
      images={form.media}
      onImagesChange={(imgs) => {
        announcements += 1
        // a loop never ends on its own in jsdom (the old effect hung the worker for five minutes), so the parent
        // stops writing after twenty and the counts below fail at once instead
        if (announcements > 20) return
        setForm((d) => ({ ...d, media: imgs }))
      }}
      video={form.video}
      onVideoChange={(v) => setForm((d) => ({ ...d, video: v }))}
      title="A night"
      startLocal="2026-12-05T19:00"
      venueName="The Wheeler Centre"
      venueCity="Melbourne"
      organisationId="o-1"
    />
  )
}

afterEach(() => {
  parentRenders = 0
  announcements = 0
  vi.restoreAllMocks()
})

describe('the media step and its form', () => {
  it('announces its images once on mount, and the form settles', () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })
    render(<TheForm />)
    expect(errors.filter((e) => /Maximum update depth/.test(e))).toEqual([])
    expect(announcements).toBe(1)
    // the first render, then the one the single announcement causes
    expect(parentRenders).toBeLessThanOrEqual(3)
  })

  it('carries a finished cover upload through to the form, url and all', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:local-preview', revokeObjectURL: () => {} }))
    const { container } = render(<TheForm start={[]} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const file = new File([new Uint8Array(2048)], 'cover.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(latestMedia[0]?.url).toBe('https://example.com/uploaded-cover.jpg'))
    expect(latestMedia[0]?.uploading).toBe(false)
  })
})
