import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import {
  AUTHORITY_WORDS,
  PERMISSION_WORDS,
  PHOTO_OWNED_WORDS,
  SUBMISSION_ENTRIES,
  SUBMISSION_ENTRY_WORDS,
  SUBMISSION_ROLES,
  SUBMISSION_PRIVACY_LINE,
  SUBMISSION_ROLE_WORDS,
} from '@/lib/listings/submission'
import { readSubmissionChoices } from '@/lib/listings/submission-choices'
import { submitEvent } from './actions'

export const metadata: Metadata = {
  title: 'List your event | EventLinqs',
  description: 'Selling tickets somewhere else? List your event on EventLinqs free, anywhere in Australia, with a button to your own booking page.',
  alternates: { canonical: '/submit-event' },
}

const SELECT =
  'mt-1 block min-h-[44px] w-full rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] px-3 text-[var(--text-primary)] focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20'
const LABEL = 'block text-sm font-medium text-[var(--text-primary)]'

/**
 * LIST YOUR EVENT (release checklist H1; organiser self-listing, Lawal's rulings of 8 November 2026, 07:01 and 07:05).
 * For an event sold on another site, anywhere in Australia: the event, its booking page, a photo the organiser owns and
 * the permission line. It is checked against the organiser's own booking page as it is sent and publishes itself when
 * the page bears it out (src/lib/listings/self-listing.ts); only one that cannot be verified waits for a person. The
 * listing's one button goes to the organiser's own booking page. A plain form post; it works with no script.
 */
export default async function SubmitEventPage({ searchParams }: { searchParams: Promise<{ sent?: string; problem?: string; live?: string; held?: string }> }) {
  const { sent, problem, live, held } = await searchParams
  const choices = await readSubmissionChoices()
  const guideCities = choices.cities.filter((c) => c.guide)
  const otherCities = choices.cities.filter((c) => !c.guide)
  const liveSlug = live && /^[a-z0-9-]{1,200}$/.test(live) ? live : null
  return (
    <PageShell>
      <PageHero
        eyebrow="LIST YOUR EVENT"
        title="Selling tickets somewhere else?"
        subtitle="Send us your event. We check it, list it free, and send people to your own booking page."
      />

      <ContentSection surface="base" width="wide" id="submit">
        <div className="max-w-xl">
          <p className="text-sm text-[var(--text-secondary)]">
            For events anywhere in Australia. We check your event against your own booking page as you send it, and it goes up straight away. If something cannot be checked, a person looks at it.
          </p>
          {sent === '1' ? (
            <div role="status" data-said="sent" className="mt-6 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-5 text-[var(--text-primary)]">
              {liveSlug ? (
                <p data-outcome="live">
                  Thank you. Your event is live on EventLinqs.{' '}
                  <Link href={`/events/${liveSlug}`} className="font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2">
                    See your event
                  </Link>
                </p>
              ) : held === '1' ? (
                <p data-outcome="held">Thank you. Your event has reached us. We could not check every detail against your booking page, so a person is looking at it now.</p>
              ) : (
                <p data-outcome="checking">Thank you. Your event has reached us. We are checking it against your booking page, and it is usually live within a few minutes.</p>
              )}
            </div>
          ) : (
            <form action={submitEvent} className="mt-6 space-y-5" data-submit-event>
              {problem === undefined ? null : (
                <p role="alert" data-said="problem" className="text-sm text-[var(--color-error,#b91c1c)]">
                  {problem}
                </p>
              )}
              <fieldset className="space-y-5">
                <legend className="font-display text-xl font-bold text-[var(--text-primary)]">The event</legend>
                <FormField id="se-title" name="title" label="Event name" type="text" required maxLength={200} />
                <FormField id="se-starts" name="starts" label="Starts (local time at the venue)" type="datetime-local" required />
                <FormField id="se-ends" name="ends" label="Ends (optional)" type="datetime-local" />
                <FormField id="se-venue-name" name="venue_name" label="Venue" type="text" required maxLength={160} />
                <FormField id="se-venue-address" name="venue_address" label="Venue address" type="text" required maxLength={300} autoComplete="street-address" />
                <div>
                  <label htmlFor="se-city" className={LABEL}>
                    City
                  </label>
                  <select id="se-city" name="city" required className={SELECT} defaultValue="">
                    <option value="" disabled>
                      Choose a city
                    </option>
                    {otherCities.length === 0 ? (
                      guideCities.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <optgroup label="City guides">
                          {guideCities.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Elsewhere in Australia">
                          {otherCities.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.name}, {c.state}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    )}
                  </select>
                </div>
                {choices.categories.length === 0 ? null : (
                  <div>
                    <label htmlFor="se-category" className={LABEL}>
                      Kind of event
                    </label>
                    <select id="se-category" name="category" required className={SELECT} defaultValue="">
                      <option value="" disabled>
                        Choose one
                      </option>
                      {choices.categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <FormField
                  id="se-booking-url"
                  name="booking_url"
                  label="Booking or event page"
                  type="url"
                  required
                  pattern="https://.+"
                  placeholder="https://"
                  helperText="Where people book or register. It must start with https://."
                />
                <div>
                  <label htmlFor="se-entry" className={LABEL}>
                    Entry
                  </label>
                  <select id="se-entry" name="entry" required className={SELECT} defaultValue="">
                    <option value="" disabled>
                      Choose one
                    </option>
                    {SUBMISSION_ENTRIES.map((e) => (
                      <option key={e} value={e}>
                        {SUBMISSION_ENTRY_WORDS[e]}
                      </option>
                    ))}
                  </select>
                </div>
                <FormField id="se-price" name="price" label="Lowest ticket price in dollars (paid tickets only)" type="text" inputMode="decimal" maxLength={9} />
                <FormField id="se-description" name="description" label="About the event (optional)" multiline rows={4} maxLength={2000} />
              </fieldset>

              <fieldset className="space-y-5">
                <legend className="font-display text-xl font-bold text-[var(--text-primary)]">A photo (optional)</legend>
                <div>
                  <label htmlFor="se-photo" className={LABEL}>
                    A photo of the event or the venue, if you have one
                  </label>
                  <input
                    id="se-photo"
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    aria-describedby="se-photo-helper"
                    className="mt-1 block min-h-[44px] w-full text-sm text-[var(--text-primary)] file:mr-3 file:min-h-[44px] file:rounded-lg file:border-0 file:bg-[var(--surface-2)] file:px-4 file:text-sm file:font-medium"
                  />
                  <p id="se-photo-helper" className="mt-1.5 text-sm text-[var(--text-secondary)]">
                    JPEG, PNG or WebP, under 10MB. With no photo, we design the listing from your event&rsquo;s details.
                  </p>
                </div>
                <label className="flex min-h-[44px] items-start gap-3 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" name="photo_owned" value="yes" className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{PHOTO_OWNED_WORDS}</span>
                </label>
              </fieldset>

              <fieldset className="space-y-5">
                <legend className="font-display text-xl font-bold text-[var(--text-primary)]">You</legend>
                {/* The collection notice where the details are asked (mandate M43, specification s17). */}
                <p data-collection-notice className="text-sm text-[var(--text-secondary)]">
                  {SUBMISSION_PRIVACY_LINE}{' '}
                  <Link href="/legal/privacy" className="font-semibold text-[var(--text-primary)] underline">
                    Privacy Policy
                  </Link>
                </p>
                <FormField id="se-name" name="name" label="Your name" type="text" required autoComplete="name" maxLength={120} />
                <FormField id="se-email" name="email" label="Email address" type="email" required autoComplete="email" maxLength={320} />
                <div>
                  <label htmlFor="se-role" className={LABEL}>
                    Your part in it
                  </label>
                  <select id="se-role" name="role" required className={SELECT} defaultValue="">
                    <option value="" disabled>
                      Choose one
                    </option>
                    {SUBMISSION_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {SUBMISSION_ROLE_WORDS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex min-h-[44px] items-start gap-3 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" name="authority" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
                  <span data-authority-words>{AUTHORITY_WORDS}</span>
                </label>
                <label className="flex min-h-[44px] items-start gap-3 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" name="permission" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
                  <span data-permission-words>{PERMISSION_WORDS}</span>
                </label>
              </fieldset>

              {/* Left empty by people; a form robot fills it. */}
              <div aria-hidden="true" className="hidden">
                <label htmlFor="se-website">Leave this empty</label>
                <input id="se-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
                Send your event
              </Button>
            </form>
          )}
        </div>
      </ContentSection>
    </PageShell>
  )
}
