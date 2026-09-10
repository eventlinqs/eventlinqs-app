'use client'

import { useSyncExternalStore } from 'react'

/**
 * IS THERE A `document` TO PORTAL INTO YET.
 *
 * WHY IT EXISTS. Every full-page dialog on this platform renders through
 * `createPortal(..., document.body)`, because a dialog left where it sits gets
 * trapped in the stacking context of any ancestor carrying a transform and then
 * PAINTS correctly while being impossible to click (close-out D2, 11 September
 * 2026; `scripts/guards/overlays-are-portalled.mjs` holds the rule). `document`
 * does not exist while the server renders, so every one of them needs the same
 * one-line answer to the same question.
 *
 * WHY NOT `useState(false)` PLUS AN EFFECT, which is the version everybody
 * writes first. It is exactly what `react-hooks/set-state-in-effect` refuses,
 * and the rule is right: it schedules a second render of every dialog on the
 * page for a value that cannot change. This subscribes to a store that never
 * emits, so React reads `false` on the server and `true` on the client with no
 * extra render and no hydration mismatch.
 */
const NEVER_CHANGES = () => () => {}
const ON_THE_CLIENT = () => true
const ON_THE_SERVER = () => false

export function usePortalReady(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, ON_THE_CLIENT, ON_THE_SERVER)
}
