'use client'

import { useRef, useState } from 'react'
import { prepareImageForUpload, shareOfRequest, TRANSPORT_SAFE_BYTES } from '@/lib/media/client-compress'

/**
 * THE PHOTO PAGE'S FILE CHOOSER (the PM's 09:45 of 19 November 2026, item 1 (c): the photo page failed a real organiser,
 * and every letter points organisers at it). The form posts every chosen photo in ONE request, and the platform refuses
 * a function request over 4.5 MB before our code runs (https://vercel.com/docs/functions/limitations#request-body-size),
 * so two ordinary phone photos would end on an error page. With script, each chosen photo is made to fit an equal share
 * of the request in the browser (src/lib/media/client-compress.ts: full size first, stepped quality, then size), and the
 * input carries the fitted files. With no script it is the plain input it always was.
 */
export function PhotoFilesInput({ className }: { className: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)

  async function fit() {
    const input = ref.current
    if (!input?.files || input.files.length === 0 || typeof DataTransfer === 'undefined') return
    const chosen = Array.from(input.files)
    const total = chosen.reduce((n, f) => n + f.size, 0)
    if (total <= TRANSPORT_SAFE_BYTES) {
      setNote(null)
      return
    }
    setNote('Making your photos ready to send...')
    const share = shareOfRequest(chosen.length)
    const fitted = await Promise.all(chosen.map((f) => prepareImageForUpload(f, share)))
    const carried = new DataTransfer()
    for (const f of fitted) carried.items.add(f)
    input.files = carried.files
    const after = fitted.reduce((n, f) => n + f.size, 0)
    setNote(after <= TRANSPORT_SAFE_BYTES ? null : 'These are too large to send together. Choose fewer at a time.')
  }

  return (
    <>
      <input
        ref={ref}
        id="ph-photos"
        name="photos"
        type="file"
        multiple
        required
        accept="image/jpeg,image/png,image/webp"
        onChange={() => void fit()}
        className={className}
      />
      {note ? (
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]" role="status">
          {note}
        </p>
      ) : null}
    </>
  )
}
