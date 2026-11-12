import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { MAX_PHOTOS, readPhotoPage } from '@/lib/listings/photo-permission'
import { dayWords } from '@/lib/outreach/twenty-letters'
import { createAdminClient } from '@/lib/supabase/admin'
import { givePhotosAction } from './actions'

export const dynamic = 'force-dynamic'

/** A private page reached only by the link in Lawal's own message: never indexed, never followed. */
export const metadata: Metadata = {
  title: 'Your photos | EventLinqs',
  robots: { index: false, follow: false },
}

const SELECT =
  'mt-1 block min-h-[44px] w-full rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] px-3 text-[var(--text-primary)] focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]'
const LABEL = 'block text-sm font-medium text-[var(--text-primary)]'
const CHECK = 'flex min-h-[44px] items-start gap-3 text-sm text-[var(--text-primary)]'

/**
 * AN ORGANISER'S PHOTO PAGE (Lawal, 12 November 2026, 12:01, item 2; the Growth OS order's Release 2, item 6: media
 * permissions). Reached by the secure link in Lawal's message to them (src/lib/outreach/photo-link.ts); any other address
 * is a 404. They choose one of their nights, add photos or artwork, choose where EventLinqs may use them, and say they
 * took them or may share them; src/lib/listings/photo-permission.ts records the yes and each image, pending Lawal's
 * look. A plain form post; it works with no script.
 */
export default async function PhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ contact: string; proof: string }>
  searchParams: Promise<{ sent?: string; problem?: string }>
}) {
  const { contact, proof } = await params
  const { sent, problem } = await searchParams
  const page = await readPhotoPage(createAdminClient(), contact, proof, new Date())
  if (page.state !== 'found') notFound()
  return (
    <PageShell>
      <PageHero eyebrow="YOUR PHOTOS" title="Add photos of your night" subtitle="You choose where EventLinqs may use them. Nothing is used until Lawal has looked at it." />
      <ContentSection surface="base" width="wide" id="photos">
        <div className="max-w-xl">
          <p className="text-sm text-[var(--text-secondary)]">
            Hi {page.greeting}. Add photos or artwork from one of your nights, up to {MAX_PHOTOS} at a time. They stay yours: EventLinqs uses them only where you tick below, and only for that night.
          </p>
          {sent ? (
            <div role="status" data-said="sent" className="mt-6 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-5 text-[var(--text-primary)]">
              {sent}
            </div>
          ) : null}
          {page.nights.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--text-primary)]">
              No nights of yours are listed ahead right now. Reply to Lawal&apos;s email with your next date and he will add it, then this page will show it.
            </p>
          ) : (
            <form action={givePhotosAction} className="mt-6 space-y-5" data-photo-permission>
              {problem ? (
                <p role="alert" data-said="problem" className="text-sm text-[var(--color-error,#b91c1c)]">
                  {problem}
                </p>
              ) : null}
              <input type="hidden" name="contact" value={page.contactId} />
              <input type="hidden" name="proof" value={proof} />
              <div>
                <label htmlFor="ph-night" className={LABEL}>
                  Which night
                </label>
                <select id="ph-night" name="night" required className={SELECT} defaultValue={page.nights[0]?.eventId}>
                  {page.nights.map((n) => (
                    <option key={n.eventId} value={n.eventId}>
                      {n.title}, {dayWords(n.startDate, n.timezone)}
                      {n.venueName ? ` at ${n.venueName}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ph-photos" className={LABEL}>
                  Photos or artwork
                </label>
                <input
                  id="ph-photos"
                  name="photos"
                  type="file"
                  multiple
                  required
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1 block min-h-[44px] w-full text-sm text-[var(--text-primary)] file:mr-3 file:min-h-[44px] file:rounded-lg file:border-0 file:bg-[var(--surface-2)] file:px-4 file:text-sm file:font-medium"
                />
                <p className="mt-1.5 text-sm text-[var(--text-secondary)]">JPEG, PNG or WebP, each under 10MB. Shown whole, never cropped.</p>
              </div>
              <fieldset className="space-y-2">
                <legend className={LABEL}>Where EventLinqs may use them</legend>
                <label className={CHECK}>
                  <input type="checkbox" name="on_page" value="yes" defaultChecked className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>On this night&apos;s own page and cards on EventLinqs</span>
                </label>
                <label className={CHECK}>
                  <input type="checkbox" name="in_posts" value="yes" className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>In EventLinqs&apos; social posts about this night</span>
                </label>
              </fieldset>
              <div>
                <label htmlFor="ph-name" className={LABEL}>
                  Your name
                </label>
                <input id="ph-name" name="given_by" type="text" required minLength={2} maxLength={120} autoComplete="name" className={SELECT} />
              </div>
              <label className={CHECK}>
                <input type="checkbox" name="rights" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
                <span>I took these or have the right to share them, and EventLinqs may use them where I ticked above, for this night only.</span>
              </label>
              <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
                Add my photos
              </Button>
            </form>
          )}
        </div>
      </ContentSection>
    </PageShell>
  )
}
