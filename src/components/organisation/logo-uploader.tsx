'use client'

import { useRef, useState, useTransition } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { OrganiserLogoMark } from '@/components/media'
import { removeOrganisationLogo, uploadOrganisationLogo } from '@/lib/organisation/logo'
import { IMAGE_ACCEPT_ATTR, MIN_LOGO_LONG_EDGE } from '@/lib/media/limits'

/**
 * THE LOGO CONTROL.
 *
 * Two things here are deliberate and neither is standard in the category.
 *
 * 1. The preview is on the NAVY, because that is where the logo actually goes.
 *    A logo settings panel that previews on white is how a black wordmark gets
 *    uploaded, looks perfect in settings, and then disappears on the poster.
 *    Humanitix publishes exactly this caveat and hands the check back to the
 *    organiser ("We recommend checking if your logo matches both light and
 *    dark modes"). Here it is measured server-side and the answer is shown.
 * 2. The panel says what it DID, not what it might do. If the mark needed a
 *    light tile to stay readable, it says so in a sentence, so the organiser is
 *    never surprised by their own poster.
 *
 * The preview goes through OrganiserLogoMark rather than an image tag of its
 * own, per the media architecture: feature code never imports next/image
 * directly. That component also fits the mark to a HEIGHT, so a landscape
 * wordmark is not squashed into a square badge's shape.
 */

type Placement = 'on-navy' | 'on-tile'

export function LogoUploader({
  organisationId,
  organisationName,
  initialUrl,
  initialPlacement,
}: {
  organisationId: string
  organisationName: string
  initialUrl: string | null
  /** Server-measured on load, so the panel is honest before any upload. */
  initialPlacement: Placement | null
}) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [placement, setPlacement] = useState<Placement | null>(initialPlacement)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = (file: File) => {
    setError(null)
    const data = new FormData()
    data.set('file', file)
    data.set('organisationId', organisationId)
    startTransition(async () => {
      const result = await uploadOrganisationLogo(data)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setUrl(result.url)
      setPlacement(result.placement)
    })
  }

  const onRemove = () => {
    setError(null)
    startTransition(async () => {
      const result = await removeOrganisationLogo(organisationId)
      if (!result.ok) {
        setError(result.error ?? 'We could not remove that logo. Please try again.')
        return
      }
      setUrl(null)
      setPlacement(null)
    })
  }

  return (
    <section
      aria-labelledby="org-logo-heading"
      className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
    >
      <h2 id="org-logo-heading" className="font-display text-lg font-bold text-ink-900">
        Your logo
      </h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-600">
        This goes on your poster, your story card and every post image we build for you, at the
        top, where a promoter puts their own mark. Ours drops to one small line underneath.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
        {/* The preview, on the navy the artefacts are actually drawn on. */}
        <div>
          <div className="flex h-[132px] w-full items-center justify-center rounded-xl border border-ink-200 bg-[#0A1628] p-4">
            <OrganiserLogoMark
              src={url}
              name={organisationName}
              height={84}
              maxWidth={160}
              placement={placement ?? 'on-tile'}
            />
          </div>
          <p className="mt-2 text-center text-xs text-ink-500">
            {url ? 'On your artefacts' : 'Your name is used until you add a mark'}
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-600 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" aria-hidden />
              {pending ? 'Working' : url ? 'Replace logo' : 'Upload logo'}
            </button>
            {url && (
              <button
                type="button"
                disabled={pending}
                onClick={onRemove}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove
              </button>
            )}
            <input
              ref={inputRef}
              id="organisation-logo"
              name="organisation-logo"
              type="file"
              accept={IMAGE_ACCEPT_ATTR}
              className="sr-only"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) onFile(file)
                e.target.value = ''
              }}
            />
          </div>

          {placement && url && (
            <p className="mt-3 rounded-lg bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-700">
              {placement === 'on-navy'
                ? 'Your mark reads clearly on the navy, so it sits straight on the artwork with nothing behind it.'
                : 'Your mark is dark, so on the navy it would disappear. We put it on a white tile on every artefact, which keeps it readable. A version with a transparent background and light lettering would sit straight on the artwork instead.'}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-ink-600">
            <li>
              PNG with a transparent background is best. JPEG, WebP, AVIF and iPhone HEIC also
              work. Vector files such as SVG are not accepted.
            </li>
            <li>
              At least {MIN_LOGO_LONG_EDGE} pixels on the longest side, because it goes onto an A4
              poster as well as a screen. Square marks and landscape wordmarks are both fine and
              neither gets squashed.
            </li>
            <li>Under 10MB.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
