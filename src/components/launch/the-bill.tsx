'use client'

import { useState } from 'react'
import { encodeBillRef } from '@/lib/launch/bill-ref'
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
  code,
}: {
  names: string[]
  onChange: (next: string[]) => void
  /** The kit code. Null until the draft is persisted. */
  code: string | null
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
          <ul className="mt-4 space-y-3">
            {names.map(name => (
              <li
                key={name}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-3"
              >
                <span className="text-sm font-medium text-ink-900">{name}</span>

                {/* The link that makes the promise above true. Without this
                    the act landing page had nothing pointing at it, so the
                    structural half of the spread mechanic (ruling 0.3) was a
                    destination with no route to it. */}
                {code ? (
                  <ActLink code={code} name={name} />
                ) : (
                  <span className="text-xs text-ink-500">
                    Their link appears once your kit is saved.
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onChange(names.filter(n => n !== name))}
                  className="ml-auto inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
                  aria-label={`Remove ${name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Reveal>
  )
}

/** One act's own link, copyable in a tap. */
function ActLink({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false)
  const path = `/launch/with/${encodeBillRef(code, name)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <a
        href={path}
        className="truncate rounded bg-ink-50 px-2 py-1 font-mono text-xs text-ink-700 underline-offset-2 hover:underline"
      >
        {path}
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-[44px] items-center rounded-full border border-ink-300 px-4 text-xs font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50"
      >
        {copied ? 'Copied' : 'Copy their link'}
      </button>
    </span>
  )
}
