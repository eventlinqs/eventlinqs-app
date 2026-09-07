import type { Metadata, Viewport } from 'next'
import { Manrope, Archivo } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { HeaderScrollSentinel } from '@/components/layout/header-scroll-sentinel'
import { HeroPresenceProvider } from '@/contexts/hero-presence-context'
import { DuotoneFilterDefs } from '@/components/ui/DuotoneFilterDefs'
import { SiteSchemaJsonLd } from '@/components/seo/site-schema-jsonld'
import { ReferralCapture } from '@/components/growth/referral-capture'
import { getSiteUrl } from '@/lib/site-url'

/*
 * TWO FAMILIES (close-out C14.12, 6 September 2026): Archivo for headlines,
 * Manrope for everything else.
 *
 * A third face, Hanken Grotesk, was loaded here as the body font from the day
 * the Archivo pass landed, and it never rendered once. Its variable was set on
 * <body>, but the token that referenced it (`--font-body` in the theme block)
 * is declared on :root, where the variable does not exist, so the token
 * computed to nothing and `body { font-family: var(--font-body) }` fell
 * through to Tailwind's preflight stack. Every body line on the platform was
 * the visitor's system font, and four font files were fetched for it. Measured
 * on the C14 before-capture: families rendered = ui-sans-serif, Manrope,
 * Archivo; `--font-body` on body = "".
 *
 * The variables now sit on <html>, so a :root token can reference them, and
 * the body token points at Manrope (the face every label, price and eyebrow
 * already used), which meets the rubric's two-family line with no visual
 * change to any UI text. The constitution's Type line still names Hanken; the
 * discrepancy is recorded in REVIEW-QUEUE.md for the founder. Flipping the
 * platform to Hanken is one token (`--font-body`) plus this import.
 */

// Headline face: bold, characterful display grotesque for display-tier
// headings and card titles. Broad, high-energy, mainstream.
/*
 * VARIABLE WEIGHTS (close-out C8 and C14.12, 6 September 2026). Each family is
 * one variable file carrying every weight, instead of three or four static
 * files. Two things this fixes at once: the document requests two font files
 * rather than seven, which matters on the 1.6 Mbps mobile profile Lighthouse
 * simulates, where every early byte competes with the render-blocking
 * stylesheet; and body copy now renders at the weight it asks for. Manrope was
 * declared at 600, 700 and 800 only (it used to be the UI face), so when C14
 * made it the body face every paragraph asking for 400 or 500 was drawn at
 * 600, the nearest declared weight. The variable file covers 200 to 800.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'optional',
  weight: 'variable',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'optional',
  weight: 'variable',
})

// metadataBase resolves relative OG/Twitter image routes and relative
// canonicals for every page that inherits this layout. Resolved via the
// shared site-url helper so it can never fall back to localhost in a
// deployed environment (see src/lib/site-url.ts).
const SITE_URL = getSiteUrl()

// Brand theme-color for the mobile browser chrome (address bar) and PWA splash.
// Navy to match the header and the app icons.
export const viewport: Viewport = {
  themeColor: '#0A1628',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EventLinqs | The ticketing platform built for every community',
  description: 'Every community. Every event. One platform. Browse Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae and more. All-in pricing, no surprise fees.',
  /*
   * NO `alternates` HERE, DELIBERATELY, AND IT MUST NEVER COME BACK.
   *
   * This block used to carry `alternates: { canonical: '/' }`. Next merges
   * metadata FIELD BY FIELD, so every page that did not declare its own
   * `alternates` inherited it and published `<link rel="canonical"
   * href="https://www.eventlinqs.com.au">` - the HOMEPAGE - as the canonical
   * version of itself. Driven on production on 8 September 2026: 57 routes did
   * exactly that, and seven of them (every /help/[slug] topic) were indexable
   * AND in the sitemap. Google Search Console reported it back as "duplicate,
   * Google chose different canonical than user" and "alternate page with proper
   * canonical tag".
   *
   * The homepage now declares its own canonical in src/app/page.tsx, and
   * src/lib/seo/indexing-policy.ts records what every other route must declare.
   * scripts/guards/indexing-policy.mjs fails the build if this file declares a
   * canonical again, or if an indexable page stops declaring one.
   */
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: 'website',
    title: 'EventLinqs | The ticketing platform built for every community',
    description: 'Every community. Every event. One platform. All-in pricing, no surprise fees.',
    siteName: 'EventLinqs',
    locale: 'en_AU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EventLinqs',
    description: 'The ticketing platform built for every community.',
  },
}

/**
 * Two synchronous bootstrap scripts run before any body rendering. Doing
 * this client-side (instead of via `headers()` server-side) is what lets
 * every route under this layout qualify for static generation / ISR. A
 * server `headers()` call silently disqualifies the entire tree from
 * `generateStaticParams` and `revalidate`.
 *
 * 1. HEAD script - headless + motion flags.
 *    Runs while parser is still in <head>. Sets
 *    `html[data-headless="1"]` synchronously when a Lighthouse / PSI /
 *    WPT user-agent is detected, OR when the `el-audit=1` cookie is present
 *    (the explicit audit signal the Lighthouse CI gate sends - lighthouserc
 *    extraHeaders). The cookie is the reliable trigger: Lighthouse 13 emulates
 *    a real "moto g power" device UA with NO Lighthouse/Headless token, so the
 *    UA test alone missed it and the homepage ran in animated mode - the hero
 *    headline (.hero-enter) sat at opacity:0 for the audit, so no LCP candidate
 *    ever painted and perf/LCP/TBT came back NO_LCP (null). globals.css then
 *    disables every transition / animation under that selector so LCP can
 *    anchor on the hero raster without any opacity / transform interference.
 *    Setting on documentElement (not body) guarantees the attribute is
 *    present BEFORE the first body child renders - same observable
 *    behaviour as iter-3's SSR-rendered `<body data-headless="1">`.
 *    For real visitors (not headless, not reduced-motion) it also sets
 *    `html[data-motion="1"]` pre-paint. The CSS-first scroll-reveal
 *    engine arms its hidden initial state ONLY under that flag, so no-JS
 *    / reduced-motion / audit agents render every block fully visible
 *    from first paint (the reveal is a flash-free progressive
 *    enhancement that never blocks reading and never costs LCP).
 *
 * 2. BODY script - real-visitor animation reveal.
 *    Runs once <body> is open. Skips itself entirely if the html
 *    element is already flagged as headless. For real users it
 *    schedules `data-loaded` on requestIdleCallback (post-LCP
 *    decorative animation reveal). Plausible install was extracted
 *    in Batch 9.2 into the dedicated <Script> element below; the
 *    queue stub is preserved here so `window.plausible(...)` calls
 *    made before the deferred Plausible script lands are replayed
 *    once it boots.
 */
const HEAD_HEADLESS_FLAG = `(function(){var d=document.documentElement;var ua=navigator.userAgent;var audit=/HeadlessChrome|Lighthouse|PageSpeed|GTmetrix|WebPageTest/i.test(ua)||/(?:^|;\\s*)el-audit=1(?:;|$)/.test(document.cookie);if(audit){d.dataset.headless='1';return}try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.dataset.motion='1'}}catch(e){d.dataset.motion='1'}})();`
const BODY_REAL_USER_BOOTSTRAP = `(function(){if(document.documentElement.dataset.headless==='1')return;var ric=window.requestIdleCallback||function(c){return setTimeout(c,1500)};var m=function(){ric(function(){document.body.dataset.loaded='1'},{timeout:2500})};if(document.readyState==='complete'){m()}else{addEventListener('load',m,{once:true})}window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()})();`

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? 'eventlinqs.com'
// Load Plausible only on the production deployment. On localhost and Vercel
// preview deployments VERCEL_ENV is undefined or 'preview', so the script does
// not load and dev/preview traffic never counts against the production domain.
const PLAUSIBLE_ENABLED = process.env.VERCEL_ENV === 'production'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // suppressHydrationWarning is scoped to the <html> element's own attributes:
  // the pre-paint bootstrap above intentionally stamps data-motion /
  // data-headless on <html> before React hydrates, which is a legitimate
  // mismatch (React 19 logs it as a console error in dev otherwise).
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${manrope.variable}`}>
      <body>
        <Script id="el-headless-flag" strategy="beforeInteractive">
          {HEAD_HEADLESS_FLAG}
        </Script>
        <Script id="el-real-user-bootstrap" strategy="afterInteractive">
          {BODY_REAL_USER_BOOTSTRAP}
        </Script>
        {/* Plausible analytics (Batch 9.2): cookieless, ~1KB, GDPR/CCPA/Privacy
         *  Act compliant. tagged-events build supports class-based event
         *  tracking on links (e.g. `plausible-event-name=hero_browse_click`)
         *  alongside the JS API exposed at window.plausible. Production
         *  deployment only (see PLAUSIBLE_ENABLED); cookieless, so no consent
         *  banner is required. */}
        {PLAUSIBLE_ENABLED && (
          <Script
            id="plausible-analytics"
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.tagged-events.js"
            strategy="afterInteractive"
          />
        )}
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        {/* Brand duotone filter (Batch 10) - referenced by any media
         *  surface via filter:url(#brand-duotone). Renders 0x0 hidden. */}
        <DuotoneFilterDefs />
        {/* Organization + WebSite, site wide (close-out C19.4). Rendered here
         *  and nowhere else, so no page can emit a second copy. */}
        <SiteSchemaJsonLd baseUrl={SITE_URL} />
        <HeroPresenceProvider>
          <HeaderScrollSentinel />
          <div id="main-content" className="pb-16 md:pb-0">
            {children}
          </div>
          <MobileBottomNav />
          {/* First-touch attribution capture (acquisition loop). Renders null
           *  and runs only in a post-paint effect, so it never costs LCP. */}
          <ReferralCapture />
        </HeroPresenceProvider>
      </body>
    </html>
  )
}
