'use client'

import { useState } from 'react'
import type { ComposeState } from '@/app/launch/actions'
import { Reveal } from '@/components/ui/reveal'
import { KitLinkBar } from './kit-link-bar'
import { TheBill } from './the-bill'

/**
 * THE REVEAL. The highest-leverage moment in the product.
 *
 * THE BOUNDARY (founder ruling 0.2a, 9 August 2026): a stranger sees the full
 * kit rendered at full fidelity. Downloads and a working tracked link require
 * an account. They see everything and take nothing until they claim it.
 *
 * The copy at that boundary is a statement of fact, never a gate: nothing is
 * being withheld as a trick, so nothing needs justifying. What an account
 * buys is the set of things that need a live event behind them to mean
 * anything at all.
 *
 * Motion: CSS-only, through the shared Reveal primitive, armed under
 * html[data-motion="1"] so reduced-motion and headless audits get the final
 * state from first paint.
 */

type Props = {
  state: ComposeState
  onEditDescription: () => void
}

export function KitReveal({ state, onEditDescription }: Props) {
  const { payload, questions, recurringNote, reachFraming, code, ephemeral } = state
  const [bill, setBill] = useState<string[]>(payload?.billNames ?? [])

  if (!payload) return null

  const isUnlisted = payload.visibility !== 'public'

  return (
    <section
      aria-labelledby="kit-reveal-heading"
      aria-live="polite"
      className="mx-auto max-w-7xl px-6 py-14 sm:px-8 sm:py-16 lg:px-12"
    >
      <Reveal>
        <p
          className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]"
          style={{ fontWeight: 600 }}
        >
          Your launch kit
        </p>
        <h2
          id="kit-reveal-heading"
          className="mt-2 font-headline text-2xl font-bold text-ink-900 sm:text-3xl"
        >
          {payload.title || 'Your event'}
        </h2>
        {payload.summary ? (
          <p className="mt-3 max-w-2xl text-base text-ink-600">{payload.summary}</p>
        ) : null}
      </Reveal>

      {/* The honest answer to a recurring description (defect D1). It never
          claims recurrence is supported and never leaves the organiser
          wondering which date we picked. */}
      {recurringNote ? (
        <Reveal>
          <p className="mt-6 rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-700">
            {recurringNote}
          </p>
        </Reveal>
      ) : null}

      {/* Visibility, stated plainly and one tap to change. Never a modal the
          organiser has to have an opinion about, and never a warning. */}
      <Reveal>
        <div className="mt-6 rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-sm text-ink-700">{payload.visibilityReason}</p>
          {payload.addressHeldBack ? (
            <p className="mt-2 text-sm text-ink-500">
              Your street address stays private. Anyone you share this with sees
              the suburb until they are coming.
            </p>
          ) : null}
        </div>
      </Reveal>

      {/* Only the fields their own words did not answer. Never a blank form. */}
      {questions.length > 0 ? (
        <Reveal>
          <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5">
            <h3 className="font-headline text-lg font-semibold text-ink-900">
              A couple of things to fill in
            </h3>
            <ul className="mt-3 space-y-2">
              {questions.map(q => (
                <li key={q} className="text-base text-ink-700">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      ) : null}

      {/* The artefacts. Full fidelity, on screen, for anybody. */}
      <Reveal stagger>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ArtefactCard
            title="Your event page"
            body="The real page, in the platform's own design. This is what a buyer lands on."
          />
          <ArtefactCard
            title="Your A4 poster"
            body="Print-ready, with a code that opens your page. Put it in the window."
          />
          <ArtefactCard
            title="Three share cards"
            body="A story, a square and a tall post, each built to the size that platform actually publishes."
          />
        </div>
      </Reveal>

      {/* THE BILL. Typed by the organiser, never inferred from prose. */}
      <TheBill names={bill} onChange={setBill} />

      {/* The bookmarkable link (0.2c: 30 days, no account). */}
      <KitLinkBar code={code} ephemeral={ephemeral} />

      {/* THE BOUNDARY. A statement of what is next, not a gate. */}
      <Reveal>
        <div className="mt-10 rounded-xl border border-ink-200 bg-white p-6">
          <h3 className="font-headline text-lg font-semibold text-ink-900">
            {isUnlisted ? 'Ready to send it out?' : 'Ready to sell tickets?'}
          </h3>
          <p className="mt-2 max-w-2xl text-base text-ink-600">
            {isUnlisted
              ? 'Add your details and you can download everything, and your link starts counting who is coming.'
              : reachFraming === 'tickets'
                ? 'Add your details and you can download everything, and every share starts counting the tickets it sells.'
                : 'Add your details and you can download everything, and every share starts counting who turns up.'}{' '}
            Free events stay free.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <a
              href="/signup?from=launch"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink-900 px-7 text-base font-semibold text-white transition hover:bg-ink-800"
            >
              Save my kit
            </a>
            <button
              type="button"
              onClick={onEditDescription}
              className="min-h-[44px] text-base font-medium text-ink-600 underline-offset-4 transition hover:text-ink-900 hover:underline"
            >
              Change what I wrote
            </button>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function ArtefactCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <h3 className="font-headline text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm text-ink-600">{body}</p>
    </div>
  )
}
