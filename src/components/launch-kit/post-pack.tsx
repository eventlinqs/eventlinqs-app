'use client'

import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import type { Caption, CaptionPlatform } from '@/lib/broadcast/captions'
import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_ORDER,
  type SocialCardFormat,
} from '@/lib/broadcast/social-card-spec'

/**
 * THE POST PACK: one panel per channel, carrying the two things the organiser
 * would otherwise make themselves at eleven at night.
 *
 * Left: the artefact in the shape that channel actually takes, downloaded at
 * the published size for that placement. Right: the caption already written in
 * that channel's register, one tap to the clipboard.
 *
 * Both carry the SAME tracked link for that channel, so whichever they use,
 * the sale comes back attributed. The honest note under each caption says what
 * that channel does with a link, because Instagram and LinkedIn behave nothing
 * alike and pretending otherwise wastes the organiser's time.
 */

type Props = {
  eventId: string
  captions: Caption[]
  /** Which card shape leads for each channel. */
  leadFormat: Record<CaptionPlatform, SocialCardFormat>
  /** False when share tooling is off: links are plain, not tracked. */
  tracked: boolean
}

const CHANNEL_ACCENT: Record<string, string> = {
  instagram: 'bg-[#B32E87]',
  facebook: 'bg-[#0C5DCF]',
  whatsapp: 'bg-[#075E54]',
  x: 'bg-black',
  linkedin: 'bg-[#00568C]',
  email: 'bg-ink-700',
}

function cardHref(eventId: string, format: SocialCardFormat, channel: CaptionPlatform) {
  return `/api/organiser/events/${eventId}/card/${format}?channel=${channel}`
}

export function PostPack({ eventId, captions, leadFormat, tracked }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(c => (c === key ? null : c)), 2000)
    } catch {
      // The caption is on screen and selectable; nothing is lost.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {captions.map(caption => {
        const lead = leadFormat[caption.platform]
        const spec = SOCIAL_CARD_FORMATS[lead]
        const captionKey = `caption-${caption.platform}`
        const subjectKey = `subject-${caption.platform}`
        return (
          <article
            key={caption.platform}
            className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 px-5 py-3">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${CHANNEL_ACCENT[caption.platform] ?? 'bg-ink-700'}`}
              />
              <h3 className="font-display text-base font-bold text-ink-900">{caption.label}</h3>
              <span className="text-xs text-ink-500">
                {caption.characters} characters
                {caption.limit ? ` of ${caption.limit}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                {caption.subject && (
                  <div className="mb-3">
                    <p className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
                      Subject
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 break-words text-sm font-semibold text-ink-900">
                        {caption.subject}
                      </p>
                      <button
                        type="button"
                        onClick={() => copy(subjectKey, caption.subject ?? '')}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:border-[var(--brand-accent-strong)] hover:bg-ink-50"
                      >
                        {copied === subjectKey ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {copied === subjectKey ? 'Copied' : 'Copy subject'}
                      </button>
                    </div>
                  </div>
                )}

                <p className="whitespace-pre-wrap break-words rounded-lg bg-canvas p-4 text-sm leading-relaxed text-ink-900">
                  {caption.text}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => copy(captionKey, caption.text)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-600"
                  >
                    {copied === captionKey ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                    {copied === captionKey ? 'Caption copied' : 'Copy caption'}
                  </button>
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-600">
                    {caption.register}
                  </p>
                </div>

                <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-600">
                  {caption.linkNote}
                  {tracked
                    ? ' The link in this caption is your tracked link for this channel, so anything it sells shows up under this channel in your reach.'
                    : ' Share tooling is off right now, so this is your plain event link and it will not be attributed.'}
                </p>
              </div>

              <div className="lg:border-l lg:border-ink-100 lg:pl-5">
                <p className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  The image
                </p>
                <a
                  href={cardHref(eventId, lead, caption.platform)}
                  className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)]"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {spec.label}, {spec.width} x {spec.height}
                </a>
                {/* Where the asset belongs, shown rather than assumed. The spec
                    has always carried `postedTo` and the UI never rendered it,
                    so a promoter could download the 9:16 story card from beside
                    an Instagram caption and post it to the feed.

                    The next figure is UNSOURCED: it is observed in-app behaviour
                    and Meta publishes no page stating it. The bound that IS
                    published is the API range, 4:5 to 1.91:1, at
                    https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
                    Instagram crops anything taller than 3:4. */}
                <p className="mt-2 text-xs font-semibold text-ink-700">
                  Post to: {spec.postedTo}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{spec.justification}</p>

                <p className="mt-3 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  Other shapes
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {SOCIAL_CARD_ORDER.filter(format => format !== lead).map(format => (
                    <a
                      key={format}
                      href={cardHref(eventId, format, caption.platform)}
                      aria-label={`Download the ${SOCIAL_CARD_FORMATS[format].label.toLowerCase()}, ${SOCIAL_CARD_FORMATS[format].ratio}, for ${SOCIAL_CARD_FORMATS[format].postedTo}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:border-[var(--brand-accent-strong)] hover:bg-ink-50"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {SOCIAL_CARD_FORMATS[format].label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
