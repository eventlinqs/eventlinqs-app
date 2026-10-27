import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { createAdminClient } from '@/lib/supabase/admin'
import { PARTNER_KINDS, PARTNER_KIND_WORDS, partnersOf, type Partner } from '@/lib/partners/partners'
import { sendPartnerEnquiry } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Partners | EventLinqs',
  description: 'The venues, promoters, councils and festivals EventLinqs works with, and how to become one.',
  alternates: { canonical: '/partners' },
}

/**
 * PARTNERS (Train C, row 14). Each live partner, labelled Partner, with its own page; then the enquiry form, which
 * lands in the admin queue. Nothing here is a listing: a partner is labelled wherever it shows.
 */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ sent?: string; problem?: string }> }) {
  const { sent, problem } = await searchParams
  let partners: Partner[] = []
  let unreadable = false
  try {
    partners = await partnersOf(createAdminClient(), 'live')
  } catch {
    unreadable = true
  }

  return (
    <PageShell>
      <PageHero eyebrow="PARTNERS" title="Work with EventLinqs" subtitle="Venues, promoters, councils and festivals who bring their events to more people." />

      <ContentSection surface="base" width="wide">
        {unreadable ? (
          <p data-state="refusal" className="text-sm text-[var(--text-secondary)]">
            Our partners could not be shown just now.
          </p>
        ) : partners.length === 0 ? (
          <p data-state="empty" className="max-w-xl text-[var(--text-secondary)]">
            Our first partners are joining now. Tell us about yours below.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((p) => (
              <li key={p.id} data-partner={p.slug} className="rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">Partner</p>
                <h2 className="mt-2 font-display text-lg font-bold text-[var(--text-primary)]">
                  <Link href={`/partners/${p.slug}`} className="hover:underline">
                    {p.name}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{PARTNER_KIND_WORDS[p.kind]}</p>
                <p className="mt-3 text-sm text-[var(--text-primary)]">{p.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </ContentSection>

      <ContentSection surface="alt" width="wide" id="enquire">
        <div className="max-w-xl">
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">Become a partner</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Tell us who you are and what you have in mind, and we will reply by email.</p>
          {sent === '1' ? (
            <p role="status" data-said="sent" className="mt-6 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-5 text-[var(--text-primary)]">
              Thank you. Your enquiry has reached us, and we will reply by email.
            </p>
          ) : (
            <form action={sendPartnerEnquiry} className="mt-6 space-y-5">
              {problem === undefined ? null : (
                <p role="alert" data-said="problem" className="text-sm text-[var(--color-error,#b91c1c)]">
                  {problem}
                </p>
              )}
              <FormField id="partner-name" name="name" label="Your name" type="text" required autoComplete="name" />
              <FormField id="partner-email" name="email" label="Email address" type="email" required autoComplete="email" />
              <FormField id="partner-organisation" name="organisation" label="Organisation" type="text" required autoComplete="organization" />
              <div>
                <label htmlFor="partner-kind" className="block text-sm font-medium text-[var(--text-primary)]">
                  What kind of partner
                </label>
                <select
                  id="partner-kind"
                  name="kind"
                  required
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] px-3 text-[var(--text-primary)]"
                >
                  {PARTNER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {PARTNER_KIND_WORDS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <FormField id="partner-message" name="message" label="What you have in mind" multiline rows={5} required />
              <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
                Send enquiry
              </Button>
            </form>
          )}
        </div>
      </ContentSection>
    </PageShell>
  )
}
