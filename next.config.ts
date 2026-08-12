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
  "img-src 'self' data: blob: https://*.supabase.co https://images.pexels.com https://picsum.photos https://maps.googleapis.com https://maps.gstatic.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://plausible.io https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://plausible.io https://*.upstash.io https://maps.googleapis.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.instagram.com https://www.tiktok.com",
  "worker-src 'self' blob:",
].join('; ')

// ENFORCED Content-Security-Policy, deliberately narrow.
//
// THE PROBLEM WITH THE POLICY ABOVE. It ships as
// Content-Security-Policy-Report-Only, which means it currently blocks NOTHING.
// It reports. A report-only CSP is a measurement instrument, not a control, and
// this one has been mistaken for a control (the header list below described it as
// "frame and referrer protection ... and the CSP above", as though it were
// enforcing). It also carries script-src 'unsafe-inline' 'unsafe-eval', so even
// once enforced it would not stop injected script.
//
// WHY NOT JUST FLIP IT. The comment above says to enforce "once the report run is
// clean", and whether it is clean is unknown. Flipping the full policy blind on a
// live platform can break payment (the Stripe iframe), maps, or analytics, and a
// broken checkout is a worse outcome than a missing header.
//
// SO: enforce only the directives that cost nothing and block real attacks. Each
// one below is already satisfied by the application, carries no allowlist to get
// wrong, and needs no nonce work:
//
//   object-src 'none'      no <object>/<embed>/<applet>, a classic injection sink
//   base-uri 'self'        an injected <base> cannot re-point every relative URL
//                          on the page at an attacker's host
//   frame-ancestors 'self' real clickjacking protection. ASVS 3.4.6 notes
//                          X-Frame-Options is obsolete and must not be relied on,
//                          so the header below is the belt and this is the braces
//   form-action 'self'     a form cannot be made to POST to another origin. That
//                          matters directly in this pass: it is the last line of
//                          defence if a form's destination is ever tampered with
//
// Crucially this policy declares NO default-src, so it does not restrain scripts,
// styles, images, fonts or connections at all. It cannot break what works today.
//
// The full policy stays in report-only alongside it, which is the standard
// migration shape: enforce what is safe now, keep measuring the rest. Removing
// 'unsafe-inline'/'unsafe-eval' needs per-response nonces and is the follow-up
// that turns this into actual XSS mitigation (ASVS 3.4.3).
const CSP_ENFORCED = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ')

// Security response headers, applied to every route. HSTS, nosniff, frame and
// referrer protection, a tight permissions policy that still allows the
// features the app uses (Stripe payment, geolocation city detection), the
// narrow ENFORCED CSP above, and the wider policy in report-only beside it.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), browsing-topics=()' },
  { key: 'Content-Security-Policy', value: CSP_ENFORCED },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
]

const nextConfig: NextConfig = {
  trailingSlash: false,
  // Render page metadata (<title>, <meta name="description">, etc.) in the
  // initial <head> for EVERY user agent, opting out of Next's streaming-
  // metadata optimisation. By default Next streams metadata into the body for
  // "browser" UAs (hoisted to <head> client-side) and only blocks it in <head>
  // for UAs in its built-in crawler list. Lighthouse 13's mobile UA is a pure
  // "moto g power" device string with no "Chrome-Lighthouse" token, so it was
  // treated as a browser: the meta description streamed into the body and
  // Lighthouse's head-only meta-description audit scored SEO 0.92 on event
  // detail. Any crawler/preview tool not on Next's list would be hidden the same
  // way. `htmlLimitedBots: '.'` matches every UA, so metadata is always
  // head-blocking - SEO-safe for all crawlers, not just the ones Next ships.
  // This affects metadata placement ONLY; body/Suspense streaming (the /events
  // grid + event-detail loading skeletons) is governed by Next's separate
  // built-in bot regex and is unchanged.
  htmlLimitedBots: /./,
  // Preview-density fixture. The homepage reads the 55-event catalogue fixture
  // (src/lib/dev/home-seed-fixture.json) at runtime via fs when
  // HOMEPAGE_SEED_FIXTURE=1. Trace it into the homepage serverless bundle so
  // PREVIEW deployments - where the prebuild step regenerates it - can read it
  // at runtime. On normal/production builds the file is absent and this is a
  // no-op; the flag is never honoured in production (VERCEL_ENV guard in
  // loadHomeUpcoming + the prebuild abort).
  outputFileTracingIncludes: {
    '/': ['./src/lib/dev/home-seed-fixture.json'],
    // The event-detail data path is fixture-aware under HOMEPAGE_SEED_FIXTURE=1
    // (one source of truth with the homepage), so its lambda needs the fixture
    // file too or a fixture card would 404 on the Preview. No-op when the file
    // is absent (normal/production builds).
    '/events/[slug]': ['./src/lib/dev/home-seed-fixture.json'],
    // The social cards draw brand type. satori is handed real font buffers
    // read from disk at render time, so the TTFs have to be traced into the
    // card lambda or every card would silently fall back to a system face.
    '/api/organiser/events/[id]/card/[format]': ['./src/assets/fonts/*.ttf'],
  },
  async redirects() {
    // Legacy /categories/[slug] -> the community taxonomy (Batch 5). The legacy
    // /categories/[slug] route still serves the hero categories but the taxonomy
    // lives under /community/[slug], so we 301 the matching slugs forward.
    //
    // The word "culture" is banned (CLAUDE.md): the taxonomy routes were renamed
    // /cultures -> /communities and /culture/[...] -> /community/[...], with the
    // permanent 301s below so every existing link, share, and search-index entry
    // forwards and no path breaks.
    return [
      { source: '/categories/afrobeats',                   destination: '/community/african',   permanent: true },
      { source: '/categories/amapiano',                    destination: '/community/african',   permanent: true },
      { source: '/categories/owambe',                      destination: '/community/african',   permanent: true },
      { source: '/categories/heritage-and-independence',   destination: '/community/african',   permanent: true },
      { source: '/categories/caribbean',                   destination: '/community/caribbean', permanent: true },
      { source: '/categories/gospel',                      destination: '/community/gospel',    permanent: true },
      { source: '/cultures',                               destination: '/communities',           permanent: true },
      { source: '/culture/:slug',                          destination: '/community/:slug',       permanent: true },
      { source: '/culture/:slug/:city',                    destination: '/community/:slug/:city', permanent: true },
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
      // Edge-cache the discovery surfaces so a crawler burst (e.g. Facebook
      // scraping Open Graph tags) is served from Vercel's CDN instead of
      // re-rendering against the database on every hit. CDN-Cache-Control only
      // affects Vercel's edge cache, NOT the browser Cache-Control, so it does
      // not fight Next's per-page no-store. Both routes are anonymous (no
      // cookies in the render path), so a shared cached response is safe.
      {
        // /events is dynamic (reads searchParams), so without this it is
        // never edge-cached. s-maxage 60s with 5-minute stale-while-revalidate
        // matches the page's `revalidate = 60`.
        source: '/events',
        headers: [
          { key: 'CDN-Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      {
        // Event detail is ISR (revalidate 300) and already edge-cached on
        // Vercel; this makes the edge policy explicit and serves stale for up
        // to a day while revalidating.
        source: '/events/:slug',
        headers: [
          { key: 'CDN-Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=86400' },
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
    // ── Build stability against the live Supabase pool ──
    // Static generation runs page data fetchers against the live Sydney
    // Supabase pool at build time. On Vercel's 30-core builders Next spawned
    // ~29 export workers x 8 concurrent pages each (~230 concurrent
    // prerenders), which exhausted the connection pool (PGRST003) and
    // produced statement timeouts that killed the build (notably
    // /events/[slug] after its retries). Local builds pass only because they
    // run far fewer workers at higher latency.
    //
    // Cap to <=8 workers (cpus) x 4 pages/worker (staticGenerationMaxConcurrency)
    // = <=32 concurrent renders, and let Next retry a flaky page a few times
    // (staticGenerationRetryCount) before failing the build. This is the
    // first of three defences; the others are bounded retry/backoff in the
    // build-time fetchers and a head/long-tail prerender split that moves the
    // bulk of dynamic DB-backed routes to on-demand ISR (see each route's
    // generateStaticParams). cpus also throttles compile parallelism, an
    // acceptable build-time cost for deploy reliability.
    cpus: 8,
    staticGenerationMaxConcurrency: 4,
    staticGenerationRetryCount: 3,
    // Tree-shake barrel imports per Next.js docs. Without this, importing
    // `{ Home } from 'lucide-react'` drags the full icon barrel into the
    // shared chunk on every route. Phase 1B Pre-Task 3 iter-2 measured
    // ~75 kB unused JS in shared chunks across all five page types;
    // lucide-react was the dominant offender (23 import sites).
    //
    // The @sentry/* entries were added 2026-08-05. @sentry/nextjs's browser
    // entry is `export * from '@sentry/react'`, chaining to @sentry/browser and
    // then @sentry/core, and @sentry/core carries integrations this platform
    // never runs in a browser (Supabase, GraphQL, OpenAI, Anthropic, LangGraph,
    // Statsig, Unleash). All four packages declare sideEffects:false with real
    // ESM entries, so the chain is shakeable in principle. Whether it actually
    // shakes under Turbopack is MEASURED, never assumed: the numbers and the
    // verdict are in docs/perf/sentry-client-surface.md.
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      '@supabase/ssr',
      '@supabase/supabase-js',
      '@sentry/nextjs',
      '@sentry/react',
      '@sentry/browser',
      '@sentry/core',
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
      // TEST/staging Supabase project. The preview deployment is pointed at the
      // TEST project (vkapkibzokmfaxqogypq) via the *_PREVIEW env vars, so
      // organiser media uploaded on the preview is served from this host and
      // must be allowlisted or next/image rejects it (the cover would 404).
      {
        protocol: 'https',
        hostname: 'vkapkibzokmfaxqogypq.supabase.co',
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

// Sentry build options. Source map upload requires SENTRY_AUTH_TOKEN; when the
// token is absent the plugin skips upload silently (build still succeeds). The
// runtime SDK still captures events on every deploy via NEXT_PUBLIC_SENTRY_DSN.
//
// RENAMED from sentryWebpackPluginOptions. This project builds with TURBOPACK
// (Next 16 default; the deployed chunks are named turbopack-*.js), and
// @sentry/nextjs types the `webpack` key as "Options related to webpack builds,
// has no effect if you are using Turbopack." The old name asserted a bundler
// this project has not used for some time.
const sentryBuildOptions = {
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
  // BUNDLER-AGNOSTIC size options. These are the ones that actually fire on a
  // Turbopack build. excludeDebugStatements defines __SENTRY_DEBUG__ false at
  // build time so the SDK's own logger statements drop out. Measured before
  // this landed: __SENTRY_DEBUG__ appeared 14 times and "Sentry Logger" 3 times
  // in the shipped client chunk, because the webpack-only equivalent below was
  // inert. It disables the SDK's `debug` option, which this project never sets.
  //
  // Deliberately NOT enabled, each for a stated reason, so nobody turns them on
  // assuming they are free:
  //   excludeTracing         - tracesSampleRate is 0.1, tracing is in use.
  //   excludeReplayShadowDom - on-error Session Replay is in use and these
  //   excludeReplayIframe      each remove real recording fidelity from it.
  //   excludeReplayWorker
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
  // Webpack-only options. INERT on this project: @sentry/nextjs documents this
  // key as "Options related to webpack builds, has no effect if you are using
  // Turbopack", and this project builds with Turbopack. Kept, not deleted, so a
  // future move back to webpack does not silently lose them. Nothing here is
  // load-bearing today, and automaticVercelMonitors is not firing either.
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

export default withSentryConfig(baseConfig, sentryBuildOptions);
