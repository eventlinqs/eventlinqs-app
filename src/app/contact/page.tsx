import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { ContactForm } from '@/components/features/contact/ContactForm'
import { getCategoryDisplayName } from '@/lib/hero-categories'

export const metadata: Metadata = {
  title: 'Contact Us | EventLinqs',
  description:
    'Get in touch with the EventLinqs team. We reply within 24 hours, Monday to Friday.',
  alternates: { canonical: '/contact' },
}

interface Props {
  searchParams: Promise<{ topic?: string; interest?: string; organiser?: string }>
}

/** Longest organiser name that can sensibly sit in a subject line. */
const MAX_ORGANISER_SUBJECT_LENGTH = 80

/**
 * Build the pre-filled subject line from ?topic= and ?interest= URL params.
 * Used by category landing pages and footer organiser links to pre-fill the
 * contact form so the user does not have to type boilerplate context.
 */
function buildInitialSubject(topic?: string, interest?: string, organiser?: string): string {
  // "Send a message" on an organiser profile used to point at
  // /organisers/[handle]/contact, a route that has never existed, so the
  // button 404d on every organiser profile on the platform. It now arrives
  // here carrying who the message is for.
  if (topic === 'organiser-message' && organiser) {
    return `Message for ${organiser.slice(0, MAX_ORGANISER_SUBJECT_LENGTH)}`
  }

  if (topic !== 'organiser') return ''

  if (!interest) return 'Organiser enquiry'

  switch (interest) {
    case 'create-event':
      return 'I want to create an event on EventLinqs'
    case 'pricing':
      return 'Pricing question: organiser'
    case 'login':
      return 'Organiser login help'
    default:
      // Hero category slug or Tier-2 slug → "Organiser interested in {DisplayName} events"
      return `Organiser interested in ${getCategoryDisplayName(interest)} events`
  }
}

export default async function ContactPage({ searchParams }: Props) {
  const { topic, interest, organiser } = await searchParams
  const initialSubject = buildInitialSubject(topic, interest, organiser)

  return (
    <PageShell>
      <PageHero
        eyebrow="CONTACT"
        title="Talk to a human"
        subtitle="We reply within 24 hours, Monday to Friday."
      />

      {/* Main two-column section - anchored for in-page scroll */}
      <ContentSection surface="base" width="wide" id="contact-form">
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
              Talk to our organiser team directly. We&apos;ll help you get set up on
              EventLinqs, walk you through pricing, and answer any questions before you
              go live.
            </p>
          </div>
          <Button
            href="/contact?topic=organiser#contact-form"
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
