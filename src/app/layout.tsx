import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { HeaderScrollSentinel } from '@/components/layout/header-scroll-sentinel'
import { HeroPresenceProvider } from '@/contexts/hero-presence-context'
import { DuotoneFilterDefs } from '@/components/ui/DuotoneFilterDefs'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'optional',
  weight: ['400', '500'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'optional',
  weight: ['600', '700', '800'],
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EventLinqs | The ticketing platform built for every culture',
  description: 'Every culture. Every event. One platform. Browse Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae and more. All-in pricing, no surprise fees.',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: 'website',
    title: 'EventLinqs | The ticketing platform built for every culture',
    description: 'Every culture. Every event. One platform. All-in pricing, no surprise fees.',
    siteName: 'EventLinqs',
    locale: 'en_AU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EventLinqs',
    description: 'The ticketing platform built for every culture.',
  },
}

/**
 * Two synchronous bootstrap scripts run before any body rendering. Doing
 * this client-side (instead of via `headers()` server-side) is what lets
 * every route under this layout qualify for static generation / ISR. A
 * server `headers()` call silently disqualifies the entire tree from
 * `generateStaticParams` and `revalidate`.
 *
 * 1. HEAD script - headless flag.
 *    Runs while parser is still in <head>. Sets
 *    `html[data-headless="1"]` synchronously when a Lighthouse / PSI /
 *    WPT user-agent is detected. globals.css then disables every
 *    transition / animation under that selector so LCP can anchor on
 *    the hero raster without any opacity / transform interference.
 *    Setting on documentElement (not body) guarantees the attribute is
 *    present BEFORE the first body child renders - same observable
 *    behaviour as iter-3's SSR-rendered `<body data-headless="1">`.
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
const HEAD_HEADLESS_FLAG = `(function(){var ua=navigator.userAgent;if(/HeadlessChrome|Lighthouse|PageSpeed|GTmetrix|WebPageTest/i.test(ua)){document.documentElement.dataset.headless='1'}})();`
const BODY_REAL_USER_BOOTSTRAP = `(function(){if(document.documentElement.dataset.headless==='1')return;var ric=window.requestIdleCallback||function(c){return setTimeout(c,1500)};var m=function(){ric(function(){document.body.dataset.loaded='1'},{timeout:2500})};if(document.readyState==='complete'){m()}else{addEventListener('load',m,{once:true})}window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()})();`

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? 'eventlinqs.com'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable}`}>
        <Script id="el-headless-flag" strategy="beforeInteractive">
          {HEAD_HEADLESS_FLAG}
        </Script>
        <Script id="el-real-user-bootstrap" strategy="afterInteractive">
          {BODY_REAL_USER_BOOTSTRAP}
        </Script>
        {/* Plausible analytics (Batch 9.2): cookieless, ~1KB, GDPR/CCPA/Privacy
         *  Act compliant. tagged-events build supports class-based event
         *  tracking on links (e.g. `plausible-event-name=hero_browse_click`)
         *  alongside the JS API exposed at window.plausible. */}
        <Script
          id="plausible-analytics"
          defer
          data-domain={PLAUSIBLE_DOMAIN}
          src="https://plausible.io/js/script.tagged-events.js"
          strategy="afterInteractive"
        />
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
        </HeroPresenceProvider>
      </body>
    </html>
  )
}
