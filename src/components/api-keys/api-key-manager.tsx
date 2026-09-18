'use client'

/**
 * API1. THE KEY SCREEN.
 *
 * Three jobs, in the order an organiser needs them: create a key, copy the one
 * token they will ever be shown, and revoke a key that has gone somewhere it
 * should not have.
 *
 * WHY THE TOKEN PANEL IS AS LOUD AS IT IS. This is the only moment the token
 * exists outside the integration it is for. The platform keeps a sha256 and
 * cannot recover it, so an organiser who closes this panel without copying has
 * to mint a new key. That is a fact about the design rather than an
 * inconvenience, so the panel says it plainly, in the panel, at the moment it
 * matters, rather than in a paragraph above the form nobody reads twice.
 *
 * WHY REVOKE ASKS TWICE. Revoking is instant and is felt by whatever system
 * holds the key, not by the person clicking. A second click is cheap; a broken
 * integration at midnight is not. It is an in-place confirmation rather than a
 * browser dialogue, because a native dialogue is the one piece of interface
 * this platform cannot design, cannot brand, and cannot make legible at 390.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, Copy, KeyRound, ShieldOff } from 'lucide-react'
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type ApiKeyActionState,
} from '@/app/(dashboard)/dashboard/api-keys/actions'
import type { OrganiserApiKeyRecord } from '@/lib/api/v1/keys'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

type Props = {
  organisationId: string
  organisationName: string
  keys: OrganiserApiKeyRecord[]
}

const IDLE: ApiKeyActionState = { status: 'idle' }

export function ApiKeyManager({ organisationId, organisationName, keys }: Props) {
  const [created, createAction] = useActionState(createApiKeyAction, IDLE)
  const [revoked, revokeAction] = useActionState(revokeApiKeyAction, IDLE)
  const [confirming, setConfirming] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Clear the name field once the key it named exists, so the next key starts
  // from an empty box rather than from the last one's name.
  useEffect(() => {
    if (created.status === 'created') formRef.current?.reset()
  }, [created])

  /*
   * A revoke that succeeded has already re-rendered the list, so the row that
   * was waiting for confirmation is no longer revocable and the prompt must go
   * with it. That is DERIVED rather than cleared in an effect: clearing it with
   * `setConfirming(null)` inside a `useEffect` is a cascading render, which is
   * what `react-hooks/set-state-in-effect` refuses and it is right to. Stale
   * state is simply not honoured.
   */
  const active = keys.filter((k) => k.revokedAt === null)
  const confirmingRow = active.some((k) => k.id === confirming) ? confirming : null

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="type-rail-heading text-ink-900">Create a key</h2>
        <p className="mt-2 text-sm text-ink-500">
          A key reads {organisationName} and nothing else. It cannot create, change or cancel
          anything, and it cannot see another organiser.
        </p>

        <form ref={formRef} action={createAction} className="mt-6 sm:flex sm:items-end sm:gap-3">
          <input type="hidden" name="organisationId" value={organisationId} />
          <div className="flex-1">
            <label htmlFor="apiKeyName" className="block text-sm font-medium text-ink-900">
              What is it for
            </label>
            <input
              id="apiKeyName"
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder="Front of house scanner"
              className="mt-2 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            />
          </div>
          <CreateButton />
        </form>

        {created.status === 'error' ? (
          <p role="alert" className="mt-4 text-sm text-red-700" data-testid="api-key-error">
            {created.message}
          </p>
        ) : null}

        {created.status === 'created' ? <TokenPanel token={created.token} /> : null}
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="type-rail-heading text-ink-900">Your keys</h2>
          <p className="text-sm text-ink-500" data-testid="api-key-count">
            {active.length} active of {keys.length}
          </p>
        </div>

        {revoked.status === 'error' ? (
          <p role="alert" className="mt-4 text-sm text-red-700" data-testid="api-key-revoke-error">
            {revoked.message}
          </p>
        ) : null}

        {keys.length === 0 ? (
          <p className="mt-6 text-sm text-ink-500" data-testid="api-key-empty">
            No keys yet. Create one above and it appears here.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-ink-100" data-testid="api-key-list">
            {keys.map((key) => (
              <li key={key.id} className="py-4" data-testid="api-key-row" data-key-id={key.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                      <KeyRound className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                      <span className="break-words">{key.name}</span>
                      {key.revokedAt ? (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                          Revoked
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="mt-1 font-mono text-xs text-ink-500" data-testid="api-key-prefix">
                      {key.tokenPrefix}
                      <span aria-hidden="true">...</span>
                      <span className="sr-only">, the rest is not stored</span>
                    </p>
                    {/*
                      A comma, not a pipe. Both are permitted by the copy law,
                      but at 12px in the UI face a pipe beside the word "never"
                      reads as "I never used", which the 1440 capture of
                      18 September showed plainly.
                    */}
                    <p className="mt-1 text-xs text-ink-400">
                      Created {formatDay(key.createdAt)}
                      {', '}
                      {key.lastUsedAt ? `last used ${formatDay(key.lastUsedAt)}` : 'never used'}
                      {key.revokedAt ? `, revoked ${formatDay(key.revokedAt)}` : ''}
                    </p>
                  </div>

                  {key.revokedAt ? null : confirmingRow === key.id ? (
                    <form action={revokeAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="organisationId" value={organisationId} />
                      <input type="hidden" name="keyId" value={key.id} />
                      <span className="text-xs text-ink-600">Anything using it stops working.</span>
                      <RevokeConfirmButton />
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="h-11 rounded-lg border border-ink-200 px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                      >
                        Keep it
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(key.id)}
                      data-testid="api-key-revoke"
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink-200 px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    >
                      <ShieldOff className="h-4 w-4" aria-hidden="true" />
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function CreateButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="api-key-create"
      className="mt-3 h-11 w-full rounded-lg bg-gold-500 px-6 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:opacity-60 sm:mt-0 sm:w-auto"
    >
      {pending ? 'Creating' : 'Create key'}
    </button>
  )
}

function RevokeConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="api-key-revoke-confirm"
      className="h-11 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? 'Revoking' : 'Yes, revoke'}
    </button>
  )
}

/**
 * The one showing of the token.
 *
 * `readOnly` and not `disabled`, so the value can still be selected and copied
 * by hand on a browser where the clipboard write is refused, and so a screen
 * reader reads it out rather than skipping it.
 */
function TokenPanel({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="mt-6 rounded-lg border border-gold-300 bg-gold-100/70 p-4"
      data-testid="api-key-token-panel"
    >
      <p className="text-sm font-semibold text-ink-900">Copy this key now</p>
      <p className="mt-1 text-sm text-ink-700">
        This is the only time it is shown. We keep a one way hash of it, so we cannot show it to you
        again. If you lose it, revoke the key and create another.
      </p>
      <div className="mt-3 sm:flex sm:items-center sm:gap-2">
        <input
          readOnly
          value={token}
          aria-label="Your new API key"
          data-testid="api-key-token"
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 font-mono text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        />
        <button
          type="button"
          onClick={copy}
          data-testid="api-key-copy"
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 sm:mt-0 sm:w-auto"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/**
 * A day an Australian reads without thinking about it.
 *
 * THE TIME ZONE IS NAMED, and it is not decoration. Without it the server
 * formats in UTC and the browser in whatever the reader's machine says, so the
 * two disagree and React reports a hydration mismatch. Worse than the warning:
 * for a key created after 10am AEST the two would show DIFFERENT DAYS. The
 * platform zone is the one `attendee-table.tsx` already uses, and
 * tests/unit/dashboard/no-clock-during-render.test.ts is what caught this.
 */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: PLATFORM_TIME_ZONE,
  })
}
