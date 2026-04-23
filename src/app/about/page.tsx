import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'About | EventLinqs',
  description: 'EventLinqs is built for Africa, its diaspora, and every community that knows how to celebrate.',
}

export default function AboutPage() {
  return (
    <PageShell>
      <ComingSoon
        title="About EventLinqs"
        blurb="Our story is being written. In the meantime, the work is in the product - come browse what organisers are putting on."
      />
    </PageShell>
  )
}
