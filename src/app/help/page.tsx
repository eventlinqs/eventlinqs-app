import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Rocket,
  Ticket,
  Megaphone,
  CreditCard,
  ShieldCheck,
  MessagesSquare,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { helpTopics } from '@/lib/help-content'
import type { ComponentType } from 'react'

const POPULAR_QUESTIONS: { topicSlug: string; q: string }[] = [
  { topicSlug: 'getting-started',       q: 'How do I list an event on EventLinqs?' },
  { topicSlug: 'buying-tickets',        q: 'My ticket email has not arrived. What should I do?' },
  { topicSlug: 'buying-tickets',        q: 'Can I transfer my ticket to someone else?' },
  { topicSlug: 'selling-tickets',       q: 'What does it cost to sell tickets on EventLinqs?' },
  { topicSlug: 'payments-and-payouts',  q: 'When do I receive my payout?' },
  { topicSlug: 'account-and-privacy',   q: 'How do I delete my account?' },
]

const POPULAR = POPULAR_QUESTIONS.flatMap(({ topicSlug, q }) => {
  const topic = helpTopics.find(t => t.slug === topicSlug)
  const article = topic?.articles.find(a => a.q === q)
  return article ? [{ slug: topicSlug, q: article.q, a: article.a }] : []
})

export const metadata: Metadata = {
  title: 'Help Centre | EventLinqs',
  description:
    'Find answers to common questions about buying tickets, selling tickets, payments, and your EventLinqs account.',
  alternates: { canonical: '/help' },
}

interface HelpTopic {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  href: string
}

const TOPICS: HelpTopic[] = [
  {
    icon: Rocket,
    title: 'Getting Started',
    description: 'New to EventLinqs? Start here.',
    href: '/help/getting-started',
  },
  {
    icon: Ticket,
    title: 'Buying Tickets',
    description: 'Purchases, receipts, QR codes.',
    href: '/help/buying-tickets',
  },
  {
    icon: Megaphone,
    title: 'Selling Tickets',
    description: 'For organisers: setup, pricing, payouts.',
    href: '/help/selling-tickets',
  },
  {
    icon: CreditCard,
    title: 'Payments & Payouts',
    description: 'Stripe, currencies, refunds, fees.',
    href: '/help/payments-and-payouts',
  },
  {
    icon: ShieldCheck,
    title: 'Account & Privacy',
    description: 'Login, data, security.',
    href: '/help/account-and-privacy',
  },
  {
    icon: MessagesSquare,
    title: 'Contact Us',
    description: 'Talk to a human.',
    href: '/contact',
  },
]

export default function HelpPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="HELP CENTRE"
        title="How can we help?"
        subtitle="Find answers fast, or talk to a real person."
        align="center"
      />

      {/* Topic grid */}
      <ContentSection surface="base" width="wide">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => {
            const Icon = topic.icon
            return (
              <Link
                key={topic.href}
                href={topic.href}
                className={[
                  'group relative flex flex-col gap-4 rounded-2xl',
                  'bg-[var(--surface-0)] p-7',
                  'shadow-md transition-all duration-200 ease-out',
                  'hover:shadow-xl hover:-translate-y-1',
                  'focus-visible:shadow-xl focus-visible:-translate-y-1',
                  'focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--brand-accent)]',
                  'active:shadow-sm active:translate-y-0 active:duration-75',
                  'cursor-pointer border border-[var(--surface-2)]',
                ].join(' ')}
              >
                {/* Icon */}
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-1)]">
                  <Icon className="h-6 w-6 text-[var(--brand-accent)]" />
                </div>

                {/* Text */}
                <div>
                  <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                    {topic.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {topic.description}
                  </p>
                </div>

                {/* Trailing arrow - appears on hover */}
                <span
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-[var(--text-muted)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  aria-hidden="true"
                >
                  &rsaquo;
                </span>
              </Link>
            )
          })}
        </div>
      </ContentSection>

      {/* Popular questions */}
      {POPULAR.length > 0 && (
        <ContentSection surface="alt" width="prose">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Popular questions
          </p>
          <h2 className="mb-8 font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            What people ask most.
          </h2>

          <div className="space-y-3">
            {POPULAR.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {item.q}
                  </span>
                  <svg
                    className="h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="border-t border-[var(--surface-2)] px-6 pb-6 pt-4">
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {item.a}
                  </p>
                  <Link
                    href={`/help/${item.slug}`}
                    className="mt-4 inline-flex text-sm font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-[var(--text-primary)] transition-colors"
                  >
                    See more in this topic &rsaquo;
                  </Link>
                </div>
              </details>
            ))}
          </div>
        </ContentSection>
      )}

      {/* CTA band */}
      <ContentSection surface="base" width="default">
        <div className="flex flex-col items-center gap-5 text-center">
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Can&apos;t find what you need?
          </h2>
          <p className="max-w-md text-base text-[var(--text-secondary)]">
            Our support team replies within 24 hours, Monday to Friday.
            We&apos;re real people, not bots.
          </p>
          <Button href="/contact" variant="primary" size="lg">
            Contact support
          </Button>
        </div>
      </ContentSection>
    </PageShell>
  )
}
