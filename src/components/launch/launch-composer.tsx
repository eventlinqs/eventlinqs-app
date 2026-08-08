'use client'

import { useState, useTransition } from 'react'
import { composeKit, type ComposeState } from '@/app/launch/actions'
import { KitReveal } from './kit-reveal'

/**
 * The composer's one field, and the reveal it produces.
 *
 * THE PRINCIPLE that lets one screen serve a professional promoter and someone
 * who has never sold a ticket (founder directive, 8 August 2026): never ask
 * which they are, and never branch on it. Branch on what they WROTE.
 *
 * A promoter types a dense line and gets eight fields filled. A parent types a
 * plain sentence and gets four. Neither is asked a question they cannot
 * answer, and neither sees a form full of blanks.
 *
 * Three rules hold that up, and they are enforced here and in `compose.ts`:
 *   1. Only fields the organiser's own words earned are shown.
 *   2. No industry vocabulary as a label. Banned: lineup, doors, presale, GA,
 *      tier, capacity, on-sale, allocation, comp. A promoter reads plain
 *      language as confident; a parent reads jargon as a locked door.
 *   3. Nothing explains itself unprompted. Over-explaining is how the promoter
 *      is insulted.
 */

const PLACEHOLDER = 'Comedy night at the Prince, Tuesday the 12th, five comics, $15 on the door'

export function LaunchComposer() {
  const [text, setText] = useState('')
  const [state, setState] = useState<ComposeState | null>(null)
  const [pending, startTransition] = useTransition()

  function onBuild() {
    const trimmed = text.trim()
    if (!trimmed) return
    startTransition(async () => {
      const next = await composeKit(trimmed)
      setState(next)
    })
  }

  if (state?.payload) {
    return (
      <KitReveal
        state={state}
        onEditDescription={() => setState(null)}
      />
    )
  }

  return (
    <section
      aria-labelledby="launch-composer-heading"
      className="mx-auto max-w-7xl px-6 py-14 sm:px-8 sm:py-16 lg:px-12"
    >
      <div className="mx-auto max-w-2xl">
        <h2
          id="launch-composer-heading"
          className="type-rail-heading font-headline text-ink-900"
        >
          Describe your event the way you would tell a mate
        </h2>

        <label htmlFor="launch-description" className="sr-only">
          Describe your event
        </label>
        <textarea
          id="launch-description"
          name="description"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder={PLACEHOLDER}
          className="mt-5 w-full rounded-xl border border-ink-200 bg-white p-4 text-base text-ink-900 shadow-sm outline-none transition focus:border-ink-400 focus:ring-2 focus:ring-[var(--brand-accent)]"
        />

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onBuild}
            disabled={pending || text.trim().length === 0}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink-900 px-7 text-base font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Building your kit' : 'Build my kit'}
          </button>

          <button
            type="button"
            onClick={() => {
              // "Start from blank" is the same path with an empty sentence:
              // the composer still returns a real kit shell and asks its plain
              // questions, rather than presenting an empty form.
              startTransition(async () => setState(await composeKit(' ')))
            }}
            className="min-h-[44px] text-base font-medium text-ink-600 underline-offset-4 transition hover:text-ink-900 hover:underline"
          >
            or fill it in yourself
          </button>
        </div>

        <p className="mt-4 text-sm text-ink-500">
          No account needed. Free events stay free.
        </p>
      </div>
    </section>
  )
}
