import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { ContactForm } from '@/components/features/contact/ContactForm'
import { getCategoryDisplayName } from '@/lib/hero-categories'

export const metadata: Metadata = {
  title: 'Contact Us — EventLinqs',
  description:
    'Get in touch with the EventLinqs team. We reply within 24 hours, Monday to Friday.',
}

interface Props {
  searchParams: Promise<{ topic?: string; interest?: string }>
}

/**
 * Build the pre-filled subject line from ?topic= and ?interest= URL params.
 * Used by category landing pages and footer organiser links to pre-fill the
 * contact form so the user doesn't have to type boilerplate context.
 */
function buildInitialSubject(topic?: string, interest?: string): string {
  if (topic !== 'organiser') return ''

  if (!interest) return 'Organiser enquiry'

  switch (interest) {
    case 'create-event':
      return 'I want to create an event on EventLinqs'
    case 'pricing':
      return 'Pricing question — organiser'
    case 'login':
      return 'Organiser login help'
    default:
      // Hero category slug or Tier-2 slug → "Organiser interested in {DisplayName} events"
      return `Organiser interested in ${getCategoryDisplayName(interest)} events`
  }
}

export default async function ContactPage({ searchParams }: Props) {
  const { topic, interest } = await searchParams
  const initialSubject = buildInitialSubject(topic, interest)

  return (
    <PageShell>
      <PageHero
        eyebrow="CONTACT"
        title="Talk to a human"
        subtitle="We reply within 24 hours, Monday to Friday."
      />

      {/* Main two-column section */}
      <ContentSection surface="base" width="wide">
        <ContactForm initialSubject={initialSubject} />
      </ContentSection>

      {/* Organiser CTA band */}
      <ContentSection surface="alt" width="wide">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
              Are you running an event?
            </h2>
            <p className="mt-1 max-w-lg text-sm text-[var(--text-secondary)]">
              Talk to our organiser team directly — we&apos;ll help you get set up on
              EventLinqs, walk you through pricing, and answer any questions before you
              go live.
            </p>
          </div>
          <Button
            href="mailto:organisers@eventlinqs.com?subject=EventLinqs%20-%20Organiser%20enquiry"
            variant="secondary"
            size="md"
            className="shrink-0"
          >
            Organiser enquiries
          </Button>
        </div>
      </ContentSection>
    </PageShell>
  )
}
