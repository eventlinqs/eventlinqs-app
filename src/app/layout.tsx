import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/providers/auth-provider'
import { BottomNav } from '@/components/layout/bottom-nav'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  weight: ['600', '700', '800'],
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EventLinqs | Discover & Create Amazing Events',
  description: 'The professional event ticketing and discovery platform. Create, promote, and manage events with transparent pricing and zero hidden fees.',
  alternates: { canonical: '/' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable}`}>
        <AuthProvider>
          {/*
            pb-16 md:pb-0 — reserves 64px at the bottom on mobile so the
            fixed BottomNav never covers page content. No effect on md+.
          */}
          <div className="pb-16 md:pb-0">
            {children}
          </div>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  )
}
