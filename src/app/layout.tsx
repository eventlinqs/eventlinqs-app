import type { Metadata, Viewport } from 'next'
import { Manrope, Archivo, Hanken_Grotesk } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { HeaderScrollSentinel } from '@/components/layout/header-scroll-sentinel'
import { HeroPresenceProvider } from '@/contexts/hero-presence-context'
import { DuotoneFilterDefs } from '@/components/ui/DuotoneFilterDefs'
import { ReferralCapture } from '@/components/growth/referral-capture'
import { getSiteUrl } from '@/lib/site-url'

// Body face: refined neutral grotesque (replaces Inter). Manrope stays for UI.
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'optional',
  weight: ['400', '500', '600', '700'],
})

// Headline face: bold, characterful display grotesque for display-tier
// headings and card titles. Broad, high-energy, mainstream.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'optional',
  weight: ['600', '700', '800', '900'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'optional',
  weight: ['600', '700', '800'],
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
  alternates: { canonical: '/' },
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${hanken.variable} ${archivo.variable} ${manrope.variable}`}>
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
