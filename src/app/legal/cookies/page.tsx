import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'Cookie Policy | EventLinqs',
  description: 'How EventLinqs uses cookies and similar technologies.',
}

export default function CookiesPage() {
  return (
    <PageShell>
      <ComingSoon
        title="Cookie Policy"
        eyebrow="Legal"
        blurb="Our full cookie notice is being finalised. Until then, see our Privacy Policy for how we handle your data."
      />
    </PageShell>
  )
}
