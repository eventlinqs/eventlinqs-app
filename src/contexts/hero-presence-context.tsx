'use client'

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

/**
 * HeroPresenceContext - tracks whether the current page has an active
 * `<HeroMedia>` instance mounted (Batch 9.1).
 *
 * The dual-state SiteHeader uses this to decide whether to render
 * State A (transparent over hero) or State B (navy frosted glass).
 * Hero-bearing routes register on mount; no-hero routes never
 * register and the header forces State B from initial paint.
 *
 * Implementation notes:
 *   - useSyncExternalStore avoids the setState-in-render trap and
 *     supports concurrent rendering. The "store" is a tiny ref-counted
 *     boolean - hero count > 0 means a hero is present.
 *   - The provider lives at the root layout level so every public
 *     route automatically opts in.
 *   - HeroMedia itself is NOT mutated (DO NOT TOUCH per Section 7.3).
 *     A thin composition wrapper (HeroMediaWithRegister) registers /
 *     unregisters via useEffect.
 */

interface HeroPresenceStore {
  count: number
  listeners: Set<() => void>
  subscribe: (listener: () => void) => () => void
  emit: () => void
  register: () => void
  unregister: () => void
  snapshot: () => boolean
  serverSnapshot: () => boolean
}

function createStore(): HeroPresenceStore {
  const store: HeroPresenceStore = {
    count: 0,
    listeners: new Set(),
    subscribe(listener) {
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    emit() {
      for (const l of store.listeners) l()
    },
    register() {
      store.count += 1
      store.emit()
    },
    unregister() {
      store.count = Math.max(0, store.count - 1)
      store.emit()
    },
    snapshot() {
      return store.count > 0
    },
    serverSnapshot() {
      // SSR returns false so server renders State B by default. Client
      // hydration corrects to State A when the hero registers.
      return false
    },
  }
  return store
}

interface HeroPresenceContextValue {
  hasHero: boolean
  registerHero: () => void
  unregisterHero: () => void
}

const Context = createContext<HeroPresenceContextValue | null>(null)

export function HeroPresenceProvider({ children }: { children: ReactNode }) {
  // Lazy-init the store once per provider instance. useState's lazy
  // initialiser runs on first render only and the store reference is
  // stable across re-renders, so subscribe/snapshot stay referentially
  // identical (which useSyncExternalStore relies on).
  const [store] = useState(() => createStore())

  const hasHero = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.serverSnapshot,
  )

  const registerHero = useCallback(() => {
    store.register()
  }, [store])

  const unregisterHero = useCallback(() => {
    store.unregister()
  }, [store])

  const value = useMemo<HeroPresenceContextValue>(
    () => ({ hasHero, registerHero, unregisterHero }),
    [hasHero, registerHero, unregisterHero],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useHeroPresence(): HeroPresenceContextValue {
  const value = useContext(Context)
  if (!value) {
    // Outside provider - default to hasHero=false so consumers force
    // State B. Defensive: never throw from the header consumer path.
    return {
      hasHero: false,
      registerHero: () => {},
      unregisterHero: () => {},
    }
  }
  return value
}
