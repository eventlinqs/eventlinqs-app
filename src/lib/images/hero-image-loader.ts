/**
 * next/image loader for the ABOVE-FOLD HERO (LCP) image only.
 *
 * The critical LCP image must not depend on the Vercel image optimiser's
 * cold per-width fetch+transcode (the homepage hero measured ~2x the latency of
 * an identically-sized hero for exactly this reason). This loader serves the
 * hero bytes straight from the source CDN instead:
 *
 *   - Pexels: the Pexels CDN resizes to the requested width and serves directly
 *     (no Vercel fetch+transcode hop). Globally cached, fast first byte.
 *   - Supabase public storage: already holds pre-encoded AVIF spine rasters on a
 *     fast CDN; pass the URL through unchanged (no transcode on the LCP path).
 *   - Anything else (local /public, other hosts): keep the default Vercel
 *     optimiser URL so responsive AVIF still works off the critical path.
 *
 * Image quality/design is unchanged: same source pixels, same crop, same
 * `sizes`-driven width. Only the delivery path changes. This loader is passed
 * ONLY to the hero <Image> (HeroMedia), never globally.
 */
export function heroImageLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}): string {
  if (src.includes('images.pexels.com')) {
    const base = src.split('?')[0]
    // Pexels CDN resize. tinysrgb + compress keeps bytes low; webp where the
    // browser accepts it (Pexels negotiates) so the hero stays light.
    return `${base}?auto=compress&cs=tinysrgb&fit=crop&w=${width}`
  }
  if (src.includes('.supabase.co/storage/v1/object/public/')) {
    // Pre-encoded AVIF on a fast CDN: serve directly, no optimiser transcode.
    return src
  }
  const q = quality ?? 75
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${q}`
}
