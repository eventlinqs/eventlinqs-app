'use client'

import { useState, useTransition } from 'react'
import { createOrganisation } from '../actions'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

export function OrgCreateForm({
  userEmail,
  returnTo,
  submitLabel = 'Create Organisation',
}: {
  userEmail: string
  returnTo?: string
  submitLabel?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  return (
    <form
      action={async (formData) => {
        setError(null)
        startTransition(async () => {
          const result = await createOrganisation(formData)
          if (result?.error) setError(result.error)
        })
      }}
      className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm space-y-5"
    >
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink-600 mb-1">
          Organisation Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. Sunset Events Co."
          onChange={e => {
            if (!slugEdited) setSlug(toSlug(e.target.value))
          }}
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-ink-600 mb-1">
          URL Slug <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center rounded-lg border border-ink-200 focus-within:border-gold-400 focus-within:ring-1 focus-within:ring-gold-400">
          <span className="pl-4 pr-1 text-sm text-ink-400 select-none">eventlinqs.com/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={slug}
            onChange={e => {
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              setSlugEdited(true)
            }}
            placeholder="sunset-events"
            className="flex-1 rounded-r-lg py-2.5 pr-4 text-sm outline-none bg-transparent"
          />
        </div>
        <p className="mt-1 text-xs text-ink-400">
          Only lowercase letters, numbers, and hyphens.
        </p>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-ink-600 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Tell attendees about your organisation…"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
        />
      </div>

      <div>
        <label htmlFor="website" className="block text-sm font-medium text-ink-600 mb-1">
          Website
        </label>
        <input
          id="website"
          name="website"
          type="url"
          placeholder="https://yourwebsite.com"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-600 mb-1">
            Contact Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={userEmail}
            placeholder={userEmail}
            className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-ink-600 mb-1">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+61 4XX XXX XXX"
            className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-gold-500 px-4 py-3 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Creating…' : submitLabel}
      </button>
    </form>
  )
}
