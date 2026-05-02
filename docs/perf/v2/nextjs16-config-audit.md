# Next.js 16 config audit

Date: 2026-05-02
Next.js version: 16.2.2 (verified `package.json`)
React: 19.2.4
File audited: `next.config.ts`

## Current images config

```ts
images: {
  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  qualities: [70, 75, 85],
  minimumCacheTTL: 60,
  remotePatterns: [
    { protocol: 'https', hostname: 'gndnldyfudbytbboxesk.supabase.co', pathname: '/storage/v1/object/public/**' },
    { protocol: 'https', hostname: 'picsum.photos' },
    { protocol: 'https', hostname: 'images.pexels.com' },
  ],
}
```

## Compliance vs Next.js 16 best-practice (per partner research)

| Field | Current | Recommended | Status |
|---|---|---|---|
| `formats` | `['image/avif', 'image/webp']` | AVIF before WebP | OK |
| `qualities` allowlist | `[70, 75, 85]` | Present (required in 16) | OK - present |
| `deviceSizes` | `[640, 750, 828, 1080, 1200, 1920, 2048, 3840]` | Include small mobile widths (320, 375, 414) | INCOMPLETE - small mobile widths missing |
| `imageSizes` | `[16, 32, 48, 64, 96, 128, 256, 384]` | Same recommendation | OK |
| `minimumCacheTTL` | 60 | Reasonable; could raise for stable assets | acceptable |
| `remotePatterns` | three entries | OK; picsum kept for legacy seed data, filtered out at runtime | OK |

## Findings

1. `qualities` allowlist is present. Required in Next 16 (security: prevents arbitrary `?q=` quality values). `MEDIA_QUALITY` constants (`70`, `75`, `80`) are inside this allowlist after a small adjustment - currently `MEDIA_QUALITY.hero = 80` but the allowlist is `[70, 75, 85]`. Q80 is rejected by Next at runtime and silently downgraded to the closest allowed value (75 or 85). **Open finding to fix:** either add `80` to the allowlist or change `MEDIA_QUALITY.hero` to `75` or `85`.

2. `deviceSizes` does not include 375 (the standard Lighthouse mobile preset width) or 414. The hero image with `sizes="(max-width: 768px) 100vw, 1920px"` will request a `?w=640` variant on a 375px viewport, which is fine but slightly oversized. Adding `375` would give Next a closer-fitting width. Marginal gain.

3. `formats` ordering is correct - AVIF first means the optimizer prefers AVIF when the browser sends `Accept: image/avif`.

## Decisions for this mission

- **Apply** in Iteration 3 (Next 16 image config compliance): add 375 to `deviceSizes`. Add 80 to `qualities` to match `MEDIA_QUALITY.hero`. No other config changes - the rest is already compliant.
- **Do NOT** restructure `formats`, `imageSizes`, `minimumCacheTTL`, or `remotePatterns`. They are correct.
