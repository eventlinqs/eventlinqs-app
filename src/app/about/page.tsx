import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'About | EventLinqs',
  description: 'EventLinqs is the ticketing platform built for every culture. Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae, and more.',
}

export default function AboutPage() {
  return (
    <PageShell>
      <ComingSoon
        title="About EventLinqs"
        blurb="EventLinqs is the ticketing platform built for every culture. Every community, every festival, every event that brings people together. Our story is being written. In the meantime, the work is in the product, so come browse what organisers are putting on."
      />
    </PageShell>
  )
}
