'use client'

import { useState } from 'react'
import { Reveal } from '@/components/ui/reveal'
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

export function KitArtefacts({ code, canDownload = false }: { code: string | null; canDownload?: boolean }) {
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
                {/* Deliberately a plain img, not next/image: this is a
                    private, no-store, per-draft render that must never enter
                    the shared image optimiser cache. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/launch/${code}/card/${card.format}`}
                  alt={`Your ${card.label.toLowerCase()} card`}
                  loading="lazy"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50"
                />
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
            src={`/api/launch/${code}/poster#toolbar=0&navpanes=0`}
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
