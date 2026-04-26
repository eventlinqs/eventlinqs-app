import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { HeroAmbientLayer } from './hero-ambient-layer'

/**
 * HeroMedia — the only allowed surface for above-fold full-bleed hero
 * imagery on EventLinqs.
 *
 * Contract (see docs/MEDIA-ARCHITECTURE.md §5.2):
 *   1. Always renders a raster <Image priority fetchPriority="high"> as the
 *      LCP layer. Static, no opacity transition, no transform on first paint.
 *   2. If `videoSrc` or `kenBurns` is provided, the optional ambient layer
 *      mounts client-side AFTER the LCP image commits — protecting LCP from
 *      transform/opacity disqualification.
 *   3. `image` MUST be a raster URL. SVG is rejected at the type level by
 *      requiring a known raster extension via the URL contract; runtime guard
 *      in dev throws if the URL ends in `.svg`.
 *
 * Why this exists: iter-0 produced NO_LCP because the homepage hero fell
 * through to <video poster=*.svg> with no raster peer image. SVGs are not
 * LCP-eligible per W3C LargestContentfulPaint spec, and video frames don't
 * paint until decoded. This component makes that fall-through impossible.
 */

export interface HeroMediaProps {
  /**
   * Raster image URL for the LCP layer. AVIF/WebP/JPEG/PNG only.
   * Required for every above-fold hero. SVG is rejected.
   */
  image: string
  /** Required alt text — empty string for purely decorative heroes. */
  alt: string
  /** Optional ambient video overlaid AFTER first paint commits. */
  videoSrc?: string
  /** Apply gentle ken-burns scale animation to the LCP layer post-commit. */
  kenBurns?: boolean
  /** Override sizes hint. Defaults to MEDIA_SIZES.fullBleed. */
  sizes?: string
  /** Extra classes for the wrapper. */
  className?: string
  /**
   * When true (default), wraps the image in `position: absolute; inset: 0`.
   * Set false if the parent is already constrained and you want intrinsic
   * sizing — but full-bleed hero should always be `fill`.
   */
  fillParent?: boolean
  /**
   * LCP designation. Defaults to true — HeroMedia's canonical role is the
   * above-fold LCP layer. Set false for sibling hero slides (e.g. carousel
   * positions 1+) that share the surface but must NOT compete for the LCP
   * candidate. Non-priority slides drop fetchPriority="high" and lazy-load.
   */
  priority?: boolean
}

function assertRaster(url: string): void {
  if (process.env.NODE_ENV !== 'production') {
    if (/\.svg(\?|#|$)/i.test(url)) {
      throw new Error(
        `[HeroMedia] image must be a raster URL (got SVG): ${url}. ` +
          'See docs/MEDIA-ARCHITECTURE.md §5.1 — SVGs are not LCP-eligible.',
      )
    }
  }
}

export function HeroMedia({
  image,
  alt,
  videoSrc,
  kenBurns = false,
  sizes = MEDIA_SIZES.fullBleed,
  className = '',
  fillParent = true,
  priority = true,
}: HeroMediaProps) {
  assertRaster(image)

  const wrapClasses = fillParent
    ? `absolute inset-0 overflow-hidden ${className}`
    : `relative h-full w-full overflow-hidden ${className}`

  return (
    <div className={wrapClasses}>
      {/*
        LCP LAYER — paints statically on first commit. No transform, no
        opacity transition. This is the element Lighthouse measures as LCP
        when priority=true. Sibling slides pass priority=false so they
        download lazily and never out-compete the active LCP candidate.
      */}
      <Image
        src={image}
        alt={alt}
        fill
        priority={priority}
        fetchPriority={priority ? 'high' : 'auto'}
        loading={priority ? 'eager' : 'lazy'}
        sizes={sizes}
        quality={MEDIA_QUALITY.hero}
        className="object-cover"
      />

      {/*
        AMBIENT LAYER — mounted via useEffect after rAF×2 so it cannot
        disqualify the LCP element. Renders ken-burns scale and/or video
        overlay on top of the static LCP image. Only the priority slide
        ever requests an ambient layer; non-priority sibling slides skip
        it to keep the LCP slide's overlay budget intact.
      */}
      {priority && (videoSrc || kenBurns) && (
        <HeroAmbientLayer
          videoSrc={videoSrc}
          kenBurns={kenBurns}
          posterImage={image}
        />
      )}
    </div>
  )
}
