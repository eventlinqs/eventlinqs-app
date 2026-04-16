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
import type { ComponentType } from 'react'

export const metadata: Metadata = {
  title: 'Help Centre — EventLinqs',
  description:
    'Find answers to common questions about buying tickets, selling tickets, payments, and your EventLinqs account.',
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
    href: '/help/payments',
  },
  {
    icon: ShieldCheck,
    title: 'Account & Privacy',
    description: 'Login, data, security.',
    href: '/help/account',
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

                {/* Trailing arrow — appears on hover */}
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

      {/* CTA band */}
      <ContentSection surface="alt" width="default">
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
