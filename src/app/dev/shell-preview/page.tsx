/**
 * /dev/shell-preview — visual verification page for all shell primitives.
 *
 * Visit this route to confirm every primitive renders correctly before
 * building real pages on top. Wrapped in PageShell so Header + Footer
 * chrome is validated at the same time.
 *
 * This route is development-only and should be removed or gated before
 * public launch (add to robots.txt or delete when no longer needed).
 */

import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { AuthCard } from '@/components/ui/AuthCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { FileQuestion } from 'lucide-react'
import { PreviewForm } from './PreviewForm'

function BlockLabel({ number, name }: { number: number; name: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-xs font-bold text-white">
        {number}
      </span>
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {name}
      </p>
    </div>
  )
}

export default function ShellPreviewPage() {
  return (
    <PageShell>

      {/* ── Block 1: PageHero ──────────────────────────────────────────── */}
      <PageHero
        eyebrow="PREVIEW"
        title="Page Hero Component"
        subtitle="Every interior page starts with this dark hero band - consistent height, consistent type scale."
      />

      {/* ── Block 2: Prose typography ─────────────────────────────────── */}
      <ContentSection surface="base" width="prose" aria-labelledby="block-2-heading">
        <BlockLabel number={2} name="Prose Typography" />
        <Prose>
          <h2 id="ticket-delivery">How EventLinqs Delivers Your Tickets</h2>
          <p>
            When you complete a purchase on EventLinqs, your tickets are issued
            instantly. We don&apos;t mail physical tickets - every ticket lives
            in your account and can be accessed from any device at any time.
          </p>

          <h3>Digital QR tickets</h3>
          <p>
            Each ticket contains a unique QR code generated at the time of
            purchase. The code is cryptographically signed, so it cannot be
            duplicated or forged. Event staff scan it at the door using the
            EventLinqs Scan app - the whole process takes under a second.
          </p>
          <ul>
            <li>Tickets are available immediately after payment confirms.</li>
            <li>You can download a PDF or save the ticket to Apple/Google Wallet.</li>
            <li>Lost your ticket? Log in to your account and re-download it anytime.</li>
          </ul>

          <h3>Email confirmation</h3>
          <p>
            We send a confirmation email to the address you used at checkout.
            It contains a summary of your order, the event details, and a link
            back to your ticket. If you don&apos;t see it within five minutes,
            check your spam folder before contacting support.
          </p>

          <h2 id="squad-tickets">Squad Bookings</h2>
          <p>
            If you used Squad Booking, each member of your squad receives their
            own individual ticket by email once they complete payment. The squad
            leader&apos;s confirmation email also lists the status of every
            squad member.
          </p>
          <ol>
            <li>Leader creates the squad and selects the number of tickets.</li>
            <li>An invite link is generated and shared with friends.</li>
            <li>Each friend pays their own share - no awkward reimbursements.</li>
            <li>All tickets are issued once the squad is complete.</li>
          </ol>

          <blockquote>
            Transparent fees, real-time analytics, squad booking, and a checkout
            your fans will actually complete. Built for organisers who take their
            events seriously.
          </blockquote>

          <p>
            For help with a specific order, visit{' '}
            <Link href="/help">the Help Centre</Link> or email{' '}
            <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>.
            We reply within 24 hours, Monday to Friday.
          </p>
        </Prose>
      </ContentSection>

      {/* ── Block 3: Button variants ───────────────────────────────────── */}
      <ContentSection surface="alt" aria-labelledby="block-3-heading">
        <BlockLabel number={3} name="Button Variants × Sizes" />

        <div className="space-y-8">
          {/* Primary */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Primary</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="md">Medium</Button>
              <Button variant="primary" size="lg">Large</Button>
              <Button variant="primary" size="md" disabled>Disabled</Button>
            </div>
          </div>

          {/* Secondary */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Secondary</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm">Small</Button>
              <Button variant="secondary" size="md">Medium</Button>
              <Button variant="secondary" size="lg">Large</Button>
              <Button variant="secondary" size="md" disabled>Disabled</Button>
            </div>
          </div>

          {/* Ghost */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Ghost</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="sm">Small</Button>
              <Button variant="ghost" size="md">Medium</Button>
              <Button variant="ghost" size="lg">Large</Button>
              <Button variant="ghost" size="md" disabled>Disabled</Button>
            </div>
          </div>

          {/* Link variants */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">As Links (renders &lt;Link&gt;)</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="md" href="/events">Browse Events</Button>
              <Button variant="secondary" size="md" href="/events">Secondary Link</Button>
              <Button variant="ghost" size="md" href="/events">Ghost Link</Button>
            </div>
          </div>
        </div>
      </ContentSection>

      {/* ── Block 4: FormField ─────────────────────────────────────────── */}
      <ContentSection surface="base" aria-labelledby="block-4-heading">
        <BlockLabel number={4} name="FormField Component" />

        <PreviewForm />
      </ContentSection>

      {/* ── Block 5: AuthCard ──────────────────────────────────────────── */}
      <ContentSection surface="alt" aria-labelledby="block-5-heading">
        <BlockLabel number={5} name="AuthCard Component" />

        <AuthCard
          title="Sign in"
          subtitle="Welcome back. Enter your details to continue."
          footer={
            <span>
              Don&apos;t have an account?{' '}
              <a
                href="/signup"
                className="font-medium text-[var(--brand-accent)] underline underline-offset-2 hover:text-[var(--brand-accent-hover)]"
              >
                Sign up
              </a>
            </span>
          }
        >
          <FormField
            id="auth-email"
            label="Email address"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
          <FormField
            id="auth-password"
            label="Password"
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Sign in
          </Button>
        </AuthCard>
      </ContentSection>

      {/* ── Block 6: EmptyState ────────────────────────────────────────── */}
      <ContentSection surface="base" aria-labelledby="block-6-heading">
        <BlockLabel number={6} name="EmptyState Component" />

        <EmptyState
          icon={FileQuestion}
          title="No articles yet"
          description="We're still building the help centre. In the meantime, our team is happy to answer any question directly."
          primaryAction={{ label: 'Back to Help Centre', href: '/help' }}
          secondaryAction={{ label: 'Contact support', href: '/contact' }}
        />
      </ContentSection>

      {/* ── Block 7: LoadingState ──────────────────────────────────────── */}
      <ContentSection surface="base" aria-labelledby="block-7-heading">
        <BlockLabel number={7} name="LoadingState Component" />

        <div className="max-w-xl space-y-8">
          <div>
            <p className="mb-4 text-sm text-[var(--text-muted)]">Default (3 lines)</p>
            <LoadingState />
          </div>
          <div>
            <p className="mb-4 text-sm text-[var(--text-muted)]">5 lines (for article content)</p>
            <LoadingState lines={5} />
          </div>
          <div>
            <p className="mb-4 text-sm text-[var(--text-muted)]">2 lines (for compact blocks)</p>
            <LoadingState lines={2} />
          </div>
        </div>
      </ContentSection>

      {/* ── Block 8: Dark surface ──────────────────────────────────────── */}
      <ContentSection surface="dark" aria-labelledby="block-8-heading">
        <BlockLabel number={8} name="Dark Surface - Text + Buttons" />

        <div className="space-y-8 max-w-2xl">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Text on dark background
            </h2>
            <p className="mt-3 text-base text-[var(--text-on-dark)] opacity-70">
              Supporting copy at 70% opacity - readable without competing with the heading.
              Used for subtitles, descriptions, and secondary information.
            </p>
            <p className="mt-3 text-sm text-[var(--text-on-dark)] opacity-50">
              Tertiary text at 50% opacity - metadata, timestamps, fine print.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" size="md" onSurface="dark">Primary on dark</Button>
            <Button variant="secondary" size="md" onSurface="dark">Secondary on dark</Button>
            <Button variant="ghost" size="md" onSurface="dark">Ghost on dark</Button>
          </div>

          <p className="text-xs text-white/40">
            All three variants use <code className="rounded bg-white/10 px-1 text-white/70">onSurface=&quot;dark&quot;</code> - no className overrides needed.
          </p>
        </div>
      </ContentSection>

    </PageShell>
  )
}
