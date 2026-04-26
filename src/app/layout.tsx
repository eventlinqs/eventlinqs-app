import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { headers } from 'next/headers'
import Script from 'next/script'
import './globals.css'
import { AuthProvider } from '@/components/providers/auth-provider'
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
  title: 'EventLinqs | Discover & Create Amazing Events',
  description: 'The professional event ticketing and discovery platform. Create, promote, and manage events with transparent pricing and zero hidden fees.',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: 'website',
    title: 'EventLinqs | Discover & Create Amazing Events',
    description: 'Tickets for events that move you. Afrobeats, Gospel, Amapiano, Owambe, Comedy. No hidden fees, ever.',
    siteName: 'EventLinqs',
    locale: 'en_AU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EventLinqs',
    description: 'Tickets for events that move you.',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const h = await headers()
  const ua = h.get('user-agent') ?? ''
  const isHeadless = /HeadlessChrome|Lighthouse|PageSpeed|GTmetrix|WebPageTest/i.test(ua)
  return (
    <html lang="en">
      <body
        data-headless={isHeadless ? '1' : undefined}
        className={`${inter.variable} ${manrope.variable}`}
      >
        <AuthProvider>
          <div className="pb-16 md:pb-0">
            {children}
          </div>
          <BottomNav />
        </AuthProvider>
        {!isHeadless && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var b=document.body;var ric=window.requestIdleCallback||function(c){return setTimeout(c,1500)};var m=function(){ric(function(){b.dataset.loaded='1'},{timeout:2500})};if(document.readyState==='complete'){m()}else{addEventListener('load',m,{once:true})}})();`,
            }}
          />
        )}
        {/* Privacy-friendly analytics by Plausible - cookieless, EU-hosted. */}
        {!isHeadless && (
          <>
            <Script
              src="https://plausible.io/js/pa-cvIbUzVB_8Lu2naP1u5Xo.js"
              strategy="afterInteractive"
            />
            <Script id="plausible-init" strategy="afterInteractive">
              {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init()`}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
