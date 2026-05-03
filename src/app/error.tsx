'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { EmptyState } from '@/components/ui/EmptyState'
import { captureException } from '@/lib/observability/sentry'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorBoundary({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    captureException(error, {
      tags: { boundary: 'app-router-error' },
      digest: error.digest,
    })
  }, [error])

  return (
    <PageShell>
      <PageHero
        eyebrow="Something went wrong"
        title="We hit a snag loading this page"
        subtitle="Our team has been notified. You can try again, or head back to safe ground."
        align="center"
      />

      <ContentSection surface="base" width="default">
        <EmptyState
          icon={AlertTriangle}
          title="Try again in a moment"
          description={
            error.digest
              ? `If you contact support, mention reference ${error.digest}.`
              : 'If the problem persists, contact hello@eventlinqs.com.'
          }
          primaryAction={{ label: 'Retry', onClick: reset }}
          secondaryAction={{ label: 'Back home', href: '/' }}
        />
      </ContentSection>
    </PageShell>
  )
}
