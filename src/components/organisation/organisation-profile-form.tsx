'use client'

/**
 * The organiser edits their own public profile.
 *
 * WHY THIS EXISTS. Until 9 September 2026 there was no way to. An organisation
 * was created once, in a step buried inside the event wizard, and its name,
 * story, website and contact details were frozen from that moment on. The one
 * edit-looking link on the organisation screen pointed at
 * /dashboard/organisation/create, which makes a SECOND organisation.
 *
 * Found while closing UX1.1: the first real outside organiser's bio rendered on
 * production as `**MKL Studios**`, and they could not have corrected it if they
 * had wanted to.
 *
 * THE LIVE PREVIEW is not decoration. The bio is the one field on this form
 * whose stored text and rendered output differ, because markdown is rendered
 * rather than shown (src/lib/prose/markdown-subset.ts). Showing the organiser
 * exactly what a visitor will see, as they type, is what stops the next person
 * publishing asterisks and never knowing.
 */

import { useActionState, useState } from 'react'
import { updateOrganisationProfile } from '@/app/(dashboard)/dashboard/organisation/actions'
import { OrganiserProse } from '@/components/ui/organiser-prose'

interface Props {
  organisationId: string
  name: string
  description: string | null
  website: string | null
  email: string | null
  phone: string | null
  /** The public URL this profile renders at, shown so the edit feels connected. */
  publicHref: string
}

const MAX_DESCRIPTION = 500

export function OrganisationProfileForm({
  organisationId,
  name,
  description,
  website,
  email,
  phone,
  publicHref,
}: Props) {
  const [state, action, pending] = useActionState(updateOrganisationProfile, null)
  const [bio, setBio] = useState(description ?? '')

  return (
    <form action={action} className="rounded-xl border border-ink-200 bg-white p-6">
      <input type="hidden" name="organisationId" value={organisationId} />

      <h2 className="type-rail-heading text-ink-900">Your public profile</h2>
      <p className="mt-2 text-sm text-ink-500">
        This is what attendees see on your profile page and beside every event you run.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="org-profile-name" className="mb-1 block text-sm font-medium text-ink-600">
            Business name
          </label>
          <input
            id="org-profile-name"
            name="name"
            type="text"
            required
            defaultValue={name}
            autoComplete="organization"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          />
          <p className="mt-1 text-xs text-ink-400">
            Your web address stays the same. Ask us if you need that changed.
          </p>
        </div>

        <div>
          <label htmlFor="org-profile-description" className="mb-1 block text-sm font-medium text-ink-600">
            Your story
          </label>
          <textarea
            id="org-profile-description"
            name="description"
            rows={5}
            maxLength={MAX_DESCRIPTION}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Tell attendees who you are and what you run."
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          />
          <p className="mt-1 text-xs text-ink-400">
            {bio.length} of {MAX_DESCRIPTION} characters. You can use **bold**, *italic*, links and
            lists; the formatting is applied, never shown.
          </p>
        </div>

        {bio.trim().length > 0 && (
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              How attendees will see it
            </p>
            <OrganiserProse text={bio} className="space-y-3 text-sm text-ink-600" />
          </div>
        )}

        <div>
          <label htmlFor="org-profile-website" className="mb-1 block text-sm font-medium text-ink-600">
            Website
          </label>
          <input
            id="org-profile-website"
            name="website"
            type="url"
            defaultValue={website ?? ''}
            placeholder="https://yourwebsite.com"
            autoComplete="url"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="org-profile-email" className="mb-1 block text-sm font-medium text-ink-600">
              Contact email
            </label>
            <input
              id="org-profile-email"
              name="email"
              type="email"
              defaultValue={email ?? ''}
              autoComplete="email"
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
            />
            <p className="mt-1 text-xs text-ink-400">Used by us to reach you, never published.</p>
          </div>
          <div>
            <label htmlFor="org-profile-phone" className="mb-1 block text-sm font-medium text-ink-600">
              Contact phone
            </label>
            <input
              id="org-profile-phone"
              name="phone"
              type="tel"
              defaultValue={phone ?? ''}
              autoComplete="tel"
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
            />
          </div>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {state.ok}{' '}
          <a href={publicHref} className="font-medium underline underline-offset-2">
            View your profile
          </a>
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-ink-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}
