import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'Press | EventLinqs',
  description: 'Press and media resources for EventLinqs.',
}

export default function PressPage() {
  return (
    <PageShell>
      <ComingSoon
        title="Press"
        blurb="Media kits, founder interviews and launch coverage will live here. Until then, the best story is the events themselves."
      />
    </PageShell>
  )
}
