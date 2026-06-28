'use client'

import Image from 'next/image'
import { heroImageLoader } from '@/lib/images/hero-image-loader'

/**
 * The LCP hero <Image>, isolated as a thin client component so it can carry the
 * `heroImageLoader` function (a Server Component cannot pass a function prop to
 * the client next/image). It still server-renders in the initial HTML (client
 * components SSR their first paint), so the LCP raster and its `priority`
 * preload are emitted on the server exactly as before - only the delivery path
 * (source CDN instead of the Vercel optimiser transcode) changes. Trivial
 * client JS (~the loader), no design change.
 */
export function HeroImage({
  src,
  alt,
  priority,
  sizes,
  quality,
  objectPosition = '50% 50%',
}: {
  src: string
  alt: string
  priority: boolean
  sizes: string
  quality: number
  objectPosition?: string
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      sizes={sizes}
      quality={quality}
      loader={heroImageLoader}
      className="object-cover"
      style={{ objectPosition }}
    />
  )
}
