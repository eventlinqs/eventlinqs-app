'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  coachStorageKey,
  hintStorageKey,
  type ContextualHintId,
  type GuidanceSurfaceId,
} from './registry'

/**
 * Per-device memory for guidance, so it never nags.
 *
 * localStorage, not a cookie and not the database: guidance is a property of
 * this device, it must work for a signed-out buyer, and it must never be
 * something the platform stores about a person. Every access is wrapped,
 * because localStorage throws in private browsing modes and inside some
 * embedded browsers, and a thrown storage error must never take a seat map
 * down with it.
 *
 * The read goes through useSyncExternalStore rather than an effect, which is
 * what that hook exists for: localStorage is an external store. The server
 * snapshot reports "already seen", so the coach is never in the server HTML
 * and can never flash on a device that dismissed it last week.
 */

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    // Storage unavailable: treat guidance as already seen rather than showing
    // it on every single visit, which would be the more annoying failure.
    return true
  }
}

/** Subscribers for keys this tab has written, so a write re-renders readers. */
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // Another tab dismissing the same coaching should settle this one too.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Nothing to do: the guidance simply will not be remembered on this device.
  }
  notify()
}

function clearFlag(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* no-op */
  }
  notify()
}

/** '1' when this device has seen the thing, '0' when it has not. */
function useSeenFlag(key: string): boolean {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (readFlag(key) ? '1' : '0'),
    // Server and first hydration render: assume seen, so nothing appears in
    // the HTML and nothing competes with the surface for first paint.
    () => '1',
  )
  return snapshot === '1'
}

/**
 * First-run coaching state for a surface. Open only when this device has not
 * seen this version and has not dismissed it in this session, or when the
 * person deliberately reopens it from the help launcher.
 */
export function useFirstRunCoach(surface: GuidanceSurfaceId, version: number) {
  const key = coachStorageKey(surface, version)
  const seen = useSeenFlag(key)
  const [dismissed, setDismissed] = useState(false)
  const [reopened, setReopened] = useState(false)

  const open = reopened || (!seen && !dismissed)

  const dismiss = useCallback(() => {
    setDismissed(true)
    setReopened(false)
    writeFlag(key)
  }, [key])

  /** Re-open from the launcher, without clearing the memory. */
  const reopen = useCallback(() => setReopened(true), [])

  /** Clear the memory so the sequence runs again from the start. */
  const forget = useCallback(() => {
    setDismissed(false)
    clearFlag(key)
  }, [key])

  return { open, dismiss, reopen, forget }
}

/**
 * A one-time contextual hint. Unlike the coach it is not opened on arrival: the
 * surface arms it at the moment of confusion, and once it has been shown and
 * acknowledged it stays quiet on this device forever.
 */
export function useContextualHint(hint: ContextualHintId) {
  const key = hintStorageKey(hint)
  const [visible, setVisible] = useState(false)

  /**
   * Show the hint, unless this device has already had it. The storage read
   * happens here rather than in an effect on mount, so a hint armed in the
   * very first interaction still respects a memory written last week.
   */
  const trigger = useCallback(() => {
    if (readFlag(key)) return
    setVisible(true)
  }, [key])

  const dismiss = useCallback(() => {
    setVisible(false)
    writeFlag(key)
  }, [key])

  return { visible, trigger, dismiss }
}
