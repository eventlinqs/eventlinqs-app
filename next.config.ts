import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// Content-Security-Policy. Shipped REPORT-ONLY first so violations surface in
// the browser console without breaking anything; flip the header key to
// 'Content-Security-Policy' to enforce once the report run is clean. Sources
// are the real third parties the app loads: Stripe (checkout iframe + API),
// Plausible (cookieless analytics), Supabase (data + storage images), Mapbox
// and Google Maps (city/venue maps), Pexels/Picsum (stock imagery). Sentry is
// same-origin via the /api/monitoring tunnel, so it needs no external source.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.pexels.com https://picsum.photos https://*.mapbox.com https://maps.googleapis.com https://maps.gstatic.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://plausible.io https://maps.googleapis.com https://api.mapbox.com",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://plausible.io https://*.upstash.io https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://maps.googleapis.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
].join('; ')

// Security response headers, applied to every route. HSTS, nosniff, frame and
// referrer protection, a tight permissions policy that still allows the
// features the app uses (Stripe payment, geolocation city detection), and the
// CSP above in report-only mode.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), browsing-topics=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
]

const nextConfig: NextConfig = {
  trailingSlash: false,
  async redirects() {
    // Batch 5 - /categories/[slug] → /culture/[slug] migration.
    // The legacy /categories/[slug] route still serves 7 hero categories
    // (afrobeats, amapiano, gospel, owambe, caribbean, heritage-and-
    // independence, networking) but the new taxonomy lives under
    // /culture/[slug]. We 301 the matching legacy slugs to their new
    // culture home so existing inbound links and Google index entries
    // forward to the new pages.
    return [
      { source: '/categories/afrobeats',                   destination: '/culture/african',  permanent: true },
      { source: '/categories/amapiano',                    destination: '/culture/african',  permanent: true },
      { source: '/categories/owambe',                      destination: '/culture/african',  permanent: true },
      { source: '/categories/heritage-and-independence',   destination: '/culture/african',  permanent: true },
      { source: '/categories/caribbean',                   destination: '/culture/caribbean', permanent: true },
      { source: '/categories/gospel',                      destination: '/culture/gospel',   permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'index, follow' },
          ...SECURITY_HEADERS,
        ],
      },
    ]
  },
  async rewrites() {
    // Batch 10 Track 2 - Vercel rewrites for branded storage URLs.
    // /cdn/* proxies to Supabase storage so users see eventlinqs.com URLs.
    // Parity vs Eventbrite img.evbuc.com, Ticketmaster s1.ticketm.net, DICE dice-media.imgix.net.
    return [
      {
        source: '/cdn/:path*',
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/:path*`,
      },
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Tree-shake barrel imports per Next.js docs. Without this, importing
    // `{ Home } from 'lucide-react'` drags the full icon barrel into the
    // shared chunk on every route. Phase 1B Pre-Task 3 iter-2 measured
    // ~75 kB unused JS in shared chunks across all five page types;
    // lucide-react was the dominant offender (23 import sites).
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      '@supabase/ssr',
      '@supabase/supabase-js',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Constrain quality to brand tiers. Mirrors MEDIA_QUALITY in
    // src/components/media/quality.ts. A forgotten quality={100} on a
    // feature component will now be rejected at build time rather than
    // shipping an ungated 100% asset to production.
    qualities: [70, 75, 80, 85],
    // 1 year edge cache for optimised image variants. The variant URL is
    // deterministic (src + w + q) and busts automatically when the source
    // file changes, so a long TTL is safe and dramatically improves repeat
    // LCP fetch time (post-warmup hits the CDN cache instead of going
    // through the optimiser's transcoding step).
    minimumCacheTTL: 31536000,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gndnldyfudbytbboxesk.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Batch 10 branded storage domain. Listed here so next/image accepts
      // the branded host the moment the NEXT_PUBLIC_STORAGE_DOMAIN env var
      // flips to `images.eventlinqs.com` and DNS + Supabase custom-domain
      // settings are in place.
      {
        protocol: 'https',
        hostname: 'images.eventlinqs.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
    ],
  },
};

// Sentry webpack plugin options. Source map upload requires
// SENTRY_AUTH_TOKEN; when the token is absent the plugin skips upload
// silently (build still succeeds). The runtime SDK still captures
// events on every deploy via NEXT_PUBLIC_SENTRY_DSN.
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG || "eventlinqs",
  project: process.env.SENTRY_PROJECT || "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Keep CI build logs clean; emit verbose info on local builds.
  silent: !!process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  // Route Sentry ingest through /api/monitoring so ad-blockers that
  // drop requests to sentry.io still let events through. Vercel
  // handles the rewrite automatically.
  tunnelRoute: "/api/monitoring",
  // Webpack-bundled options (v10+ shape). Tree-shaking removes Sentry
  // SDK debug logging from production bundles. automaticVercelMonitors
  // synthesises Vercel monitors for the project on each deploy.
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
};

// Always wrap with withSentryConfig. The Sentry webpack plugin is what
// tells webpack to bundle the repo-root sentry.{client,server,edge}.config.ts
// files into the deployed functions; without the wrap, the dynamic
// `await import('./sentry.server.config')` in instrumentation.ts resolves
// to nothing on the deployed server and Sentry.init never runs at boot -
// which surfaces as sentryEnabled:false on /api/health/sentry-error even
// when every DSN env var is correctly set in the runtime environment.
//
// The earlier defensive "skip when no DSN at build time" gate (PR #41
// commit dd8157b) is removed because the original /events 500 it was
// guarding against turned out to be LCP-timing-driven, not Sentry-wrap-
// driven (PR #40 fixed it via lighthouserc gather-window timing). The
// runtime sentry.*.config.ts files each have their own `if (dsn)` guard,
// so a build with no DSN in env still produces a working binary that
// just doesn't init Sentry at boot. No need to gate the wrap.
const baseConfig = withBundleAnalyzer(nextConfig);

export default withSentryConfig(baseConfig, sentryWebpackPluginOptions);
