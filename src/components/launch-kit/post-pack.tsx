'use client'

import { useState, useSyncExternalStore } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import type { Caption, CaptionPlatform } from '@/lib/broadcast/captions'
import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_ORDER,
  type SocialCardFormat,
} from '@/lib/broadcast/social-card-spec'
import { copyText } from '@/lib/share/copy-text'

/**
 * THE POST PACK: the image and the words for each channel, one channel at a time.
 *
 * Left: the caption already written for that channel, one tap to the clipboard. Right: the image in the shape that
 * channel takes, downloaded at its published size. Both carry the same tracked link for that channel, so whichever
 * the organiser uses, the sale comes back attributed (said once, in the section's own intro on the launch kit page).
 *
 * ONE CHANNEL OPEN AT A TIME (the PM's score of 15 November 2026, S1): the six cards stacked open made the success
 * screen about eleven phone screens long at 390. A row of channel chips chooses the card, Instagram first, and the
 * choice is remembered on this device (a convenience only: storage can be blocked, so the chip still works without
 * it). The research notes that sat under each card (ratios, safe areas, how X counts a link) are gone (S3); the one
 * line under the image button says where it is posted. "Copy caption" is an outlined button (S4), so the one gold
 * button on the screen is "Open your live page".
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
  email: 'bg-ink-600',
}

const STORE_KEY = 'el-post-pack-channel'
const CHANGED = 'el-post-pack-channel-changed'

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function cardHref(eventId: string, format: SocialCardFormat, channel: CaptionPlatform) {
  return `/api/organiser/events/${eventId}/card/${format}?channel=${channel}`
}

export function PostPack({ eventId, captions, leadFormat, tracked }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [picked, setPicked] = useState<CaptionPlatform | null>(null)
  // The remembered channel is device state, read through useSyncExternalStore (as the consent banner reads its
  // cookie), never set in an effect; the server and the first paint show Instagram.
  const saved = useSyncExternalStore(subscribe, readSaved, () => null)
  const first = captions.find(c => c.platform === 'instagram')?.platform ?? captions[0]?.platform
  const remembered = captions.find(c => c.platform === saved)?.platform
  const active = picked ?? remembered ?? first
  const caption = captions.find(c => c.platform === active) ?? captions[0]

  const choose = (platform: CaptionPlatform) => {
    setPicked(platform)
    try {
      window.localStorage.setItem(STORE_KEY, platform)
      window.dispatchEvent(new Event(CHANGED))
    } catch {
      // Storage is blocked: the chip still works for this visit.
    }
  }

  const copy = async (key: string, text: string) => {
    try {
      await copyText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(c => (c === key ? null : c)), 2000)
    } catch {
      // The caption is on screen and selectable; nothing is lost.
    }
  }

  if (!caption) return null
  const lead = leadFormat[caption.platform]
  const spec = SOCIAL_CARD_FORMATS[lead]
  const captionKey = `caption-${caption.platform}`
  const subjectKey = `subject-${caption.platform}`

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Choose a channel" className="flex flex-wrap gap-2">
        {captions.map(c => {
          const on = c.platform === caption.platform
          return (
            <button
              key={c.platform}
              type="button"
              aria-pressed={on}
              onClick={() => choose(c.platform)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                on
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-900 hover:border-[var(--brand-accent-strong)]'
              }`}
            >
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${CHANNEL_ACCENT[c.platform] ?? 'bg-ink-600'}`} />
              {c.label}
            </button>
          )
        })}
      </div>

      <article
        aria-label={`${caption.label} post`}
        className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 px-5 py-3">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${CHANNEL_ACCENT[caption.platform] ?? 'bg-ink-600'}`}
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

            <button
              type="button"
              onClick={() => copy(captionKey, caption.text)}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-[var(--brand-accent-strong)] hover:bg-ink-50"
            >
              {copied === captionKey ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copied === captionKey ? 'Caption copied' : 'Copy caption'}
            </button>
            {tracked ? null : (
              <p className="mt-3 text-xs leading-relaxed text-ink-600">
                Share tooling is off right now, so this caption carries your plain event link and its sales will not
                be attributed.
              </p>
            )}
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
            <p className="mt-2 text-xs text-ink-600">For {spec.postedTo}</p>

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
    </div>
  )
}
