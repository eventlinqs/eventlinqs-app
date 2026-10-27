import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { createAdminClient } from '@/lib/supabase/admin'
import { PARTNER_KIND_WORDS, livePartner } from '@/lib/partners/partners'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

/** One read per request, shared by the head and the body; a draft, a missing table or an unknown address is not found. */
const partnerFor = cache(async (slug: string) => livePartner(createAdminClient(), slug).catch(() => null))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = await partnerFor(slug)
  if (p === null) return { title: 'Partner | EventLinqs', robots: { index: false, follow: false } }
  return { title: `${p.name}, partner | EventLinqs`, description: p.summary, alternates: { canonical: `/partners/${p.slug}` } }
}

/**
 * ONE PARTNER'S PAGE (Train C, row 14), live only once the admin puts the partner live, labelled Partner at the top
 * so a partnership is never read as an organic listing.
 */
export default async function PartnerPage({ params }: Props) {
  const { slug } = await params
  const p = await partnerFor(slug)
  if (p === null) notFound()

  return (
    <PageShell>
      <ContentSection surface="base" width="default">
        <p data-label="partner" className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">
          Partner
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)]">{p.name}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{PARTNER_KIND_WORDS[p.kind]}</p>
        <p className="mt-6 max-w-2xl text-[var(--text-primary)]">{p.summary}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          {p.websiteUrl === null ? null : (
            <a
              href={p.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-full border border-[var(--surface-2)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--brand-accent)]"
            >
              Visit {p.name}
            </a>
          )}
          <Link
            href="/partners"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--brand-accent-strong)] underline underline-offset-2"
          >
            Every partner
          </Link>
        </div>
      </ContentSection>
    </PageShell>
  )
}
