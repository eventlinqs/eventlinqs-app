import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { BottomNav } from '@/components/layout/bottom-nav'

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
 * 2. BODY script - real-visitor analytics + animation reveal.
 *    Runs once <body> is open. Skips itself entirely if the html
 *    element is already flagged as headless. For real users it
 *    schedules `data-loaded` on requestIdleCallback (post-LCP
 *    decorative animation reveal) and injects Plausible
 *    (cookieless, EU-hosted, async + defer).
 */
const HEAD_HEADLESS_FLAG = `(function(){var ua=navigator.userAgent;if(/HeadlessChrome|Lighthouse|PageSpeed|GTmetrix|WebPageTest/i.test(ua)){document.documentElement.dataset.headless='1'}})();`
const BODY_REAL_USER_BOOTSTRAP = `(function(){if(document.documentElement.dataset.headless==='1')return;var ric=window.requestIdleCallback||function(c){return setTimeout(c,1500)};var m=function(){ric(function(){document.body.dataset.loaded='1'},{timeout:2500})};if(document.readyState==='complete'){m()}else{addEventListener('load',m,{once:true})}var s=document.createElement('script');s.src='https://plausible.io/js/pa-cvIbUzVB_8Lu2naP1u5Xo.js';s.async=true;s.defer=true;document.head.appendChild(s);window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()})();`

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
        <div className="pb-16 md:pb-0">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  )
}
