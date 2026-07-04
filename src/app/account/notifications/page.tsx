import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EnableAlerts } from '@/components/notifications/enable-alerts'

export const metadata: Metadata = {
  title: 'Event alerts | EventLinqs',
  description: 'Choose how EventLinqs alerts you about events you care about.',
  robots: { index: false, follow: false },
}

export default async function NotificationsSettingsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    redirect('/login?next=/account/notifications')
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Link href="/account" className="text-sm font-medium text-gold-800 underline hover:text-gold-700">
            Back to your account
          </Link>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            Event alerts
          </h1>
          <p className="mt-3 text-base text-ink-600">
            Follow organisers and scenes you love, and we will let you know the moment they have
            something on. You can turn this off any time.
          </p>
          <div className="mt-8">
            <EnableAlerts />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
