'use client'

import { useState } from 'react'
import { Reveal } from '@/components/ui/reveal'

/**
 * THE BILL. The delivery vehicle for the spread mechanic.
 *
 * FOUNDER RULING, 9 August 2026: the act's landing page with a pre-filled
 * composer is the STRUCTURAL part; these cards are the vehicle that gets a
 * person to that page. The emphasis in the Phase 0 draft was backwards and is
 * corrected here.
 *
 * NAMES ARE TYPED, NEVER INFERRED. The extraction schema has no lineup field,
 * and guessing a performer out of prose produces a share card for a pub:
 * "Comedy night at the Prince" yields "the Prince". Rendering that on the
 * reveal, in front of someone we are trying to impress, is worse than not
 * offering the feature. So the composer asks, and an empty answer is the
 * correct and common one.
 *
 * The field is deliberately unlabelled with industry vocabulary. "Who else is
 * on?" reads the same to a promoter listing support acts, a market organiser
 * listing stallholders, and a charity listing the band donating their time.
 * A parent running a birthday simply leaves it empty, and nothing about the
 * screen suggests they should not.
 */

const MAX_NAMES = 12

export function TheBill({
  names,
  onChange,
}: {
  names: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const clean = draft.trim().replace(/\s+/g, ' ')
    if (!clean || names.length >= MAX_NAMES) return
    if (names.some(n => n.toLowerCase() === clean.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...names, clean])
    setDraft('')
  }

  return (
    <Reveal>
      <div className="mt-10 rounded-xl border border-ink-200 bg-white p-5">
        <h3 className="font-headline text-base font-semibold text-ink-900">
          Who else is on?
        </h3>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          Anyone on with you gets their own card and their own link, so they can
          see what they brought in. Leave it empty if it is just you.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="bill-name" className="sr-only">
            Add a name
          </label>
          <input
            id="bill-name"
            name="billName"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            maxLength={80}
            placeholder="A name"
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-ink-200 px-3 text-base text-ink-900 outline-none transition focus:border-ink-400 focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
          <button
            type="button"
            onClick={add}
            disabled={draft.trim().length === 0 || names.length >= MAX_NAMES}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink-300 px-5 text-sm font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {names.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {names.map(name => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onChange(names.filter(n => n !== name))}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink-50 px-4 text-sm font-medium text-ink-800 transition hover:bg-ink-100"
                  aria-label={`Remove ${name}`}
                >
                  {name}
                  <span aria-hidden className="text-ink-400">
                    x
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Reveal>
  )
}
