'use client'

import { useState } from 'react'
import { Reveal } from '@/components/ui/reveal'
import { IMAGE_ACCEPT_ATTR, MAX_IMAGE_BYTES } from '@/lib/media/limits'
import type { Caption } from '@/lib/broadcast/captions'

/**
 * The rendered artefacts and the six captions.
 *
 * ONE implementation, used by both the reveal (right after composing) and the
 * bookmarkable kit page (coming back to it later). They are the same kit, so
 * they must not be two pieces of code that can drift.
 *
 * Every image here is genuine renderer output from /api/launch/[code]/...,
 * the same `renderSocialCard` and `buildEventPosterPdf` the published kit
 * uses. The first cut of the reveal shipped three bordered boxes of prose
 * where the artefacts were supposed to be, which is why this file exists and
 * why its name is literal.
 *
 * THE GATE (ruling 0.2a). Viewing is free and needs no account. The DOWNLOAD
 * control adds ?download=1, which the route refuses without a session. Being
 * straight about the limit: an inline image can be saved by anyone who knows
 * how to save an image. This is posture, not DRM, and is not pretending to be.
 */

const CARDS = [
  { format: 'story', label: 'Story', note: '1080 x 1920, for stories and reels' },
  { format: 'square', label: 'Square', note: '1080 x 1080, for the feed' },
  { format: 'feed', label: 'Tall post', note: '1440 x 1800, the tallest the feed keeps' },
] as const

/**
 * The download affordance. Present and visible for everybody, because hiding
 * it would misrepresent what the kit is; it simply says what it needs. For a
 * signed-in owner it downloads, for anybody else it goes to signup rather than
 * to a 401 the visitor would read as breakage.
 */
function DownloadControl({ href, label, canDownload }: { href: string; label: string; canDownload: boolean }) {
  return (
    <a
      href={canDownload ? `${href}${href.includes('?') ? '&' : '?'}download=1` : '/signup?from=launch'}
      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink-300 px-5 text-sm font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50"
    >
      {canDownload ? label : `${label} (needs an account)`}
    </a>
  )
}

/**
 * One card image, with the failure the live walk actually produced designed
 * for rather than left to the browser.
 *
 * When a render is refused (a rate limit) or fails, an <img> shows the
 * browser's broken-image glyph, which reads as "this product is broken" at the
 * single moment the product is trying to impress somebody. The policy comment
 * claimed a failed render "degrades to the typographic composition, never to a
 * broken kit"; that was aspiration, not behaviour. This makes it true.
 */
function CardImage({
  code,
  format,
  label,
  version,
}: {
  code: string
  format: string
  label: string
  version: number
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="flex aspect-[4/5] w-full flex-col justify-end rounded-xl border border-ink-200 bg-[#0A1628] p-5">
        <p
          className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
          style={{ fontWeight: 600 }}
        >
          {label}
        </p>
        <p className="mt-2 text-sm text-white/80">
          This one is still rendering. Refresh in a moment and it will be here.
        </p>
      </div>
    )
  }

  // The image is card-shaped and sits in a grid, so the affordance law
  // (no dead-end tiles) requires the whole tile to be a working target. It
  // opens the card at full size, which is also the thing a promoter actually
  // wants from a thumbnail: to see whether the type holds up before they post
  // it anywhere.
  return (
    <a
      href={`/api/launch/${code}/card/${format}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
      aria-label={`Open your ${label.toLowerCase()} card at full size`}
    >
      {/* Deliberately a plain img, not next/image: this is a private, per-draft
          render that must never enter the shared image optimiser cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // ?v= busts the browser's own 10-minute private cache after an artwork
        // upload. Without it the organiser uploads their photo, the card is
        // re-rendered on the server, and they still see the old one.
        src={`/api/launch/${code}/card/${format}${version ? `?v=${version}` : ''}`}
        alt={`Your ${label.toLowerCase()} card`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full rounded-xl border border-ink-200 bg-ink-50"
      />
    </a>
  )
}

/**
 * ARTWORK UPLOAD. The one control that closes the gap with a design tool.
 *
 * Everything else the composer does arranges what the organiser already told
 * us. This is the only place they put something of their own in, and a poster
 * with no photograph in it will never look like their night. Law 6 is the
 * reason this is an upload rather than a generator: we render what they supply.
 *
 * Deliberately NOT a full editor. There is no crop handle, no filter and no
 * colour field here, because the poster composes the photograph itself and a
 * control that lets somebody produce something worse than the default is a
 * control we should not ship.
 */
function KitCoverUpload({ code, onUploaded }: { code: string; onUploaded: () => void }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setState('working')
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/launch/${code}/cover`, { method: 'POST', body })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) {
        // The route answers with a sentence for the cases a person can act on
        // (too big, wrong sort of file) and a token for the ones they cannot.
        const message =
          json?.error && /\s/.test(json.error)
            ? json.error
            : 'That did not upload. Try again in a moment.'
        setError(message)
        setState('idle')
        return
      }
      setState('done')
      onUploaded()
    } catch {
      setError('That did not upload. Check your connection and try again.')
      setState('idle')
    }
  }

  return (
    <div className="mt-12 rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h3 className="font-headline text-lg font-semibold text-ink-900">
        Put your own artwork on it
      </h3>
      <p className="mt-2 max-w-prose text-sm text-ink-600">
        Upload the flyer or the photo you already have and it goes onto the
        poster and every card, cropped to each size properly. No artwork is
        fine too: the poster is designed either way.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full bg-[#0A1628] px-6 text-sm font-semibold text-white transition hover:bg-[#16233b] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand-accent)] ${
            state === 'working' ? 'pointer-events-none opacity-70' : ''
          }`}
        >
          {state === 'working' ? 'Uploading' : state === 'done' ? 'Choose a different photo' : 'Choose a photo'}
          <input
            type="file"
            name="cover"
            accept={IMAGE_ACCEPT_ATTR}
            className="sr-only"
            disabled={state === 'working'}
            onChange={event => {
              const file = event.target.files?.[0]
              // Reset the input so choosing the SAME file twice still fires,
              // which is what happens when a first attempt fails.
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
        </label>
        <span className="text-xs text-ink-500">
          JPEG, PNG, WebP, AVIF or HEIC, up to {MAX_IMAGE_BYTES / 1024 / 1024}MB. Big
          camera photos are fine, we resize them.
        </span>
      </div>

      {state === 'done' && !error ? (
        <p className="mt-3 text-sm font-medium text-ink-900" role="status">
          Your artwork is on the poster and the cards below.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function KitArtefacts({ code, canDownload = false }: { code: string | null; canDownload?: boolean }) {
  // Bumped after an artwork upload so the card images and the poster iframe
  // refetch instead of showing the browser's cached pre-upload copies.
  const [coverVersion, setCoverVersion] = useState(0)

  if (!code) {
    return (
      <Reveal>
        <div className="mt-10 rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-600">
            Your poster and cards are ready to render. Save your kit and they
            appear here.
          </p>
        </div>
      </Reveal>
    )
  }

  return (
    <>
      <Reveal>
        <KitCoverUpload code={code} onUploaded={() => setCoverVersion(Date.now())} />
      </Reveal>

      <Reveal stagger>
        <div className="mt-12">
          <h3 className="font-headline text-lg font-semibold text-ink-900">
            Your share cards
          </h3>
          <p className="mt-2 text-sm text-ink-600">
            Each one built to the size that platform actually publishes, so
            nothing important gets cropped off.
          </p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map(card => (
              <figure key={card.format} className="min-w-0">
                <CardImage code={code} format={card.format} label={card.label} version={coverVersion} />
                <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-900">{card.label}</span>
                  <span className="text-xs text-ink-500">{card.note}</span>
                </figcaption>
                <div className="mt-3">
                  <DownloadControl
                    href={`/api/launch/${code}/card/${card.format}`}
                    label="Download"
                    canDownload={canDownload}
                  />
                </div>
              </figure>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-12">
          <h3 className="font-headline text-lg font-semibold text-ink-900">
            Your A4 poster
          </h3>
          <p className="mt-2 text-sm text-ink-600">
            Print-ready, with a code that opens your page. Put it in the window.
          </p>
          <iframe
            src={`/api/launch/${code}/poster?v=${coverVersion}#toolbar=0&navpanes=0`}
            title="Your A4 poster"
            className="mt-5 h-[560px] w-full rounded-xl border border-ink-200 bg-ink-50 sm:h-[720px]"
          />
          <div className="mt-4">
            <DownloadControl
              href={`/api/launch/${code}/poster`}
              label="Download the poster"
              canDownload={canDownload}
            />
          </div>
        </div>
      </Reveal>
    </>
  )
}

/** All six captions, in full, each copyable in one tap. */
export function KitCaptions({ captions }: { captions: Caption[] }) {
  if (captions.length === 0) return null

  return (
    <Reveal stagger>
      <div className="mt-12">
        <h3 className="font-headline text-lg font-semibold text-ink-900">
          Your captions
        </h3>
        <p className="mt-2 text-sm text-ink-600">
          One for each place you post. Written for that channel, not the same
          words six times.
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {captions.map(caption => (
            <CaptionCard key={caption.platform} caption={caption} />
          ))}
        </div>
      </div>
    </Reveal>
  )
}

function CaptionCard({ caption }: { caption: Caption }) {
  const [copied, setCopied] = useState(false)
  const full = caption.subject ? `${caption.subject}\n\n${caption.text}` : caption.text

  async function copy() {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The text is on screen and selectable; a clipboard refusal is not an
      // error worth showing anybody.
      setCopied(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-headline text-base font-semibold text-ink-900">
          {caption.label}
        </h4>
        <span className="text-xs text-ink-500">{caption.register}</span>
      </div>
      {caption.subject ? (
        <p className="mt-3 text-sm font-semibold text-ink-900">{caption.subject}</p>
      ) : null}
      <p className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
        {caption.text}
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-4 inline-flex min-h-[44px] w-fit items-center justify-center rounded-full border border-ink-300 px-5 text-sm font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
