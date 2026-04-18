'use client'

import Link from 'next/link'
import Image from 'next/image'

/**
 * LiveVibeMarquee — endless horizontal scroll of community event images
 * on a black band. Replaces the old text-ticker with a visual-first
 * design: real photography, cream "community" eyebrow in gold, event
 * title overlaid on a dark gradient.
 *
 * Animation is CSS-only (90s linear infinite), pauses on hover/focus.
 * Items are doubled so the translateX(-50%) keyframe produces a seamless
 * loop.
 */

export type VibeImage = {
  id: string
  src: string
  href: string
  title: string
  community: string
}

interface Props {
  items: VibeImage[]
}

export function LiveVibeMarquee({ items }: Props) {
  if (items.length === 0) return null
  const doubled = [...items, ...items]
  return (
    <section
      aria-label="Live on EventLinqs"
      className="marquee-band overflow-hidden bg-ink-900 py-6"
    >
      <div className="mx-auto mb-4 max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-400">
          Live on EventLinqs — Community events across Australia
        </p>
      </div>
      <div className="flex w-max animate-marquee-slow gap-4 whitespace-nowrap">
        {doubled.map((item, i) => (
          <Link
            key={`${item.id}-${i}`}
            href={item.href}
            className="group relative h-[160px] w-[280px] flex-shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
          >
            <Image
              src={item.src}
              alt={item.title}
              fill
              sizes="280px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-ink-900/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gold-400">
                {item.community}
              </p>
              <p className="truncate text-sm font-semibold text-white">
                {item.title}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
