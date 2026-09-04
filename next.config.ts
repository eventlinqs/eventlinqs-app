import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { PERMANENT_REDIRECTS } from "./src/lib/seo/permanent-redirects";

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
  // places.googleapis.com is the Places (New) RPC endpoint the venue finder's
  // AutocompleteSuggestion calls from the browser (observed 4 September 2026:
  // https://places.googleapis.com/$rpc/google.maps.places.v1.Places/AutocompletePlaces,
  // reported as a connect-src violation by this policy). Without it, the day
  // this policy is enforced the finder dies quietly on every organiser.
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://plausible.io https://*.upstash.io https://maps.googleapis.com https://places.googleapis.com",
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
  // KEEP THE CARD RASTERISER OUT OF THE BUNDLER.
  //
  // src/lib/broadcast/card-raster.ts loads the resvg WebAssembly binary at RUN
  // time on purpose:
  //
  //     const wasmPath = require_.resolve('@resvg/resvg-wasm/index_bg.wasm')
  //     await initWasm(await readFile(wasmPath))
  //
  // Turbopack reads that static specifier, decides the .wasm is a module it
  // should bundle, and emits a wasm-bindgen loader that imports the glue
  // namespace `wbg`. Nothing provides `wbg`, so the production build dies:
  //
  //     ./node_modules/@resvg/resvg-wasm/index_bg.wasm_.loader.mjs:1:1
  //     Module not found: Can't resolve 'wbg'
  //
  // reached through both entry points that rasterise:
  //     app/api/organiser/events/[id]/card/[format]/route.ts   (the 18 cards)
  //     app/admin/(authed)/health/page.tsx                     (health checks)
  //
  // Marking the package external leaves it to Node's own require at run time,
  // which is exactly what the module was written to expect. This changes NOTHING
  // about how a card is rendered; it only stops the bundler from pre-empting a
  // deliberate runtime load. Found on 2 September 2026, when the resvg swap was
  // built for the first time: it had been proved in isolation but never through
  // `next build`, so this error had never had the chance to appear.
  serverExternalPackages: ['@resvg/resvg-wasm'],
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
    '/api/organiser/events/[id]/card/[format]': [
      './src/assets/fonts/*.ttf',
      // The resvg WebAssembly binary is read from disk at run time by
      // src/lib/broadcast/card-raster.ts (it is data, not a module, for the
      // reasons written out at length there). Nothing imports it, so nothing
      // traces it, so without this line the lambda ships without the one file
      // the rasteriser cannot work without.
      './node_modules/@resvg/resvg-wasm/index_bg.wasm',
    ],
    // The public composer serves the same three formats from an anonymous
    // draft and rasterises through the identical path, so it needs the binary
    // just as much. It was the route that proved this: all eighteen of its
    // cards answered HTTP 500 until the lookup was fixed.
    '/api/launch/[code]/card/[format]': [
      './src/assets/fonts/*.ttf',
      './node_modules/@resvg/resvg-wasm/index_bg.wasm',
    ],
    // The admin health page runs the card raster check end to end, which is the
    // second entry point into the same module.
    '/admin/health': ['./node_modules/@resvg/resvg-wasm/index_bg.wasm'],
  },
  async redirects() {
    // THE TABLE ITSELF MOVED to src/lib/seo/permanent-redirects.ts, unchanged,
    // and this reads it. It used to live here and only here, which meant
    // src/app/sitemap.ts could not see it and published six /categories/* URLs
    // that this very table 308s away. A sitemap entry that redirects is exactly
    // what Google's build-a-sitemap page tells you not to publish. One copy of
    // the fact, read by the config, the sitemap and the guard.
    return PERMANENT_REDIRECTS
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          /*
           * INDEXABLE ON PRODUCTION ONLY.
           *
           * This was a flat `index, follow` on every deployment, and it was
           * OVERRIDING a Vercel default rather than filling a gap. Vercel adds
           * `X-Robots-Tag: noindex` to preview deployments itself
           * (https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines,
           * fetched 15 August 2026: "Vercel automatically adds a noindex header
           * to preview deployments"), and a framework-level header replaces it.
           *
           * Measured on 15 August 2026, the branch preview answered
           * `x-robots-tag: index, follow`, served a `robots.txt` with `Allow: /`,
           * and published a sitemap of 932 URLs on the preview host. That is a
           * near-complete second copy of the catalogue, on a different hostname,
           * openly inviting Googlebot, on a platform whose growth plan names SEO
           * as one of its two compounding engines. It is recorded as a pre-launch
           * blocker in docs/PRE-LAUNCH-HARDENING.md, flagged 15 May 2026 and
           * still open three months later.
           *
           * `VERCEL_ENV` is documented as available at BUILD time with the values
           * production, preview or development
           * (https://vercel.com/docs/environment-variables/system-environment-variables,
           * fetched 15 August 2026), and `headers()` is evaluated at build, so
           * each deployment bakes in the answer for the environment it belongs to.
           *
           * IT FAILS OPEN TO TODAY'S BEHAVIOUR ON PURPOSE. When `VERCEL_ENV` is
           * absent, which is every local build and every CI build, the value stays
           * `index, follow`. That keeps the Lighthouse SEO `is-crawlable` audit
           * green on localhost, where the gate actually runs, so closing an SEO
           * hole cannot open a gate failure somewhere else.
           *
           * THIS IS HALF THE FIX. It stops previews being INDEXED. It does not
           * stop them being READ: the deployment still answers 200 to anyone with
           * the URL. Access control is Vercel Deployment Protection, which is a
           * dashboard action and remains the founder's, exactly as
           * docs/PRE-LAUNCH-HARDENING.md sets out.
           */
          {
            key: 'X-Robots-Tag',
            value:
              process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
                ? 'noindex, nofollow'
                : 'index, follow',
          },
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
    // THE ERROR HAS TO NAME THE VARIABLE, not the rewrite.
    //
    // Unguarded, this template produced
    // `destination: "undefined/storage/v1/object/public/:path*"` and Next
    // rejected it with `Error: Invalid rewrite found`. That message is true and
    // useless: it points at a rewrite the reader did not write, one minute after
    // a prebuild guard said the missing variable was "not blocking". Two
    // separate people would go and read next.config.ts before either looked at
    // the environment.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL is not set, so the /cdn rewrite has no destination. ' +
          'This stops the build. Load the environment first: the TEST values live in .env.test, ' +
          'and every deployed scope has it set in Vercel. ' +
          '(Next would otherwise report this as "Invalid rewrite found", which names the rewrite ' +
          'rather than the missing variable.)',
      )
    }

    return [
      {
        source: '/cdn/:path*',
        destination: `${supabaseUrl}/storage/v1/object/public/:path*`,
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
    /*
     * THE CANDIDATE LIST IS A DOCUMENT-SIZE DECISION, NOT ONLY AN IMAGE ONE.
     *
     * Measured on the homepage, 3 September 2026, warmed, mobile:
     *   1,023,683 chars of HTML, 113 <img>, 1,677 /_next/image URLs
     *   348,045 of those chars are the srcset URLs themselves: 34% of the page
     *
     * Every width in these two lists is emitted into the srcset of every image
     * that can use it, and each URL costs about 208 characters because it
     * carries a percent-encoded absolute storage URL. So a width nobody selects
     * is not free: it is paid 113 times in the document, on a throttled mobile
     * CPU that has to parse all of it before the hero can win LCP.
     *
     * WHAT WAS REMOVED AND WHY EACH ONE IS SAFE:
     *   375   below every real mobile selection. A 412px viewport at DPR 1.75
     *         needs 721px and picks 750; the smallest device that reaches this
     *         entry would have to be under 375 CSS px at DPR 1.
     *   1200  sits between 1080 and 1920 with no layout breakpoint on it.
     *   2048  sits beside 1920 and serves the same class of display.
     *   48,96 no component requests a fixed size in that band. The measured
     *         fixed sizes in use are 16, 32, 192, 256, 288, 320 and 512.
     *
     * WHAT WAS DELIBERATELY KEPT:
     *   640, 750, 828  the mobile LCP band. Dropping 750 would push a 412px
     *                  phone up to 828 and make the LCP image BIGGER, which is
     *                  the opposite of the intent. Verified: the hero is served
     *                  at w=750 as a 33 KB AVIF.
     *   3840           the full-bleed hero on a 2x desktop still needs it.
     */
    deviceSizes: [640, 750, 828, 1080, 1920, 3840],
    imageSizes: [16, 32, 64, 128, 256, 384],
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
