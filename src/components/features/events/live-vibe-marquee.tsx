'use client'

import Link from 'next/link'
import Image from 'next/image'
import { BrandedPlaceholder } from '@/components/ui/branded-placeholder'

/**
 * LiveVibeMarquee — cream editorial band of community event cards.
 *
 * White elevated cards on the canvas surface (#FAFAF7). 16:10 cover image
 * on top (organiser photo OR BrandedPlaceholder — never Pexels here),
 * community label in gold above the title. 80s linear animation, pauses
 * on hover/focus, respects prefers-reduced-motion.
 */

export type VibeImage = {
  id: string
  src: string | null
  href: string
  title: string
  community: string
  placeholderCategory?: string | null
}

interface Props {
  items: VibeImage[]
}

export function LiveVibeMarquee({ items }: Props) {
  if (items.length === 0) return null
  const doubled = [...items, ...items]
  return (
    <section
      aria-labelledby="live-vibe-heading"
      className="marquee-band overflow-hidden bg-canvas py-16 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-500 opacity-80" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-coral-500" />
          </span>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-coral-500">
            Live on EventLinqs
          </p>
        </div>
        <h2
          id="live-vibe-heading"
          className="mt-3 font-display text-2xl font-bold text-ink-900 sm:text-3xl"
        >
          Community events across Australia
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-600 sm:text-base">
          Real events, real organisers, real communities. This is what&apos;s happening right now.
        </p>
      </div>

      <div className="mt-8 flex w-max animate-marquee-vibe gap-4 whitespace-nowrap pl-4 sm:pl-6 lg:pl-8">
        {doubled.map((item, i) => (
          <Link
            key={`${item.id}-${i}`}
            href={item.href}
            className="group relative flex h-[260px] w-[280px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white shadow-[0_4px_16px_rgba(10,22,40,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(10,22,40,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-100">
              {item.src ? (
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  sizes="280px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <BrandedPlaceholder category={item.placeholderCategory ?? null} />
              )}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gold-600">
                {item.community}
              </p>
              <p className="mt-1.5 whitespace-normal text-sm font-semibold leading-snug text-ink-900 line-clamp-2">
                {item.title}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
