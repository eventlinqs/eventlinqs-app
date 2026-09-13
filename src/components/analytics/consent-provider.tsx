'use client'

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  NO_CONSENT,
  allGranted,
  allRefused,
  decodeConsent,
  encodeConsent,
  hasDecided,
  type ConsentDecision,
} from '@/lib/analytics/consent'

/**
 * THE ONE PLACE THAT KNOWS WHAT THIS VISITOR AGREED TO.
 *
 * Close-out AN1. The banner writes the decision here, the script loader reads
 * it here, and nothing else reads the cookie directly. Two readers of one cookie
 * is two chances to disagree about whether somebody said yes, and the direction
 * that fails is the one that loads an advertising tracker for a person who said
 * no.
 *
 * IT STARTS AT NO_CONSENT AND STAYS THERE UNTIL THE BROWSER HAS BEEN READ. The
 * server does not read the cookie and pass it down on purpose: doing that would
 * make every page in the platform vary by a cookie and defeat its caching, for a
 * banner. So the first paint is always "nothing agreed to", which is the safe
 * direction, and the real decision arrives one tick later.
 *
 * THE READ GOES THROUGH useSyncExternalStore, NOT AN EFFECT. The cookie is an
 * external store and that is what the hook is for; the effect-plus-setState form
 * is what `react-hooks/set-state-in-effect` refuses, and the repo already reads
 * device state this way (src/lib/guidance/memory.ts). The server snapshot is a
 * sentinel rather than an empty string, because "nobody has been asked yet" and
 * "the browser has not been read yet" must not collapse into one value: the
 * first would show the banner in server HTML, and it would then flash at
 * somebody who answered months ago.
 */
interface ConsentContextValue {
  decision: ConsentDecision
  decided: boolean
  /** True until the cookie has been read, so nothing renders on a guess. */
  loading: boolean
  acceptAll: () => void
  refuseAll: () => void
}

/**
 * The snapshot before this browser has been read. Not a valid cookie value, so
 * `decodeConsent` would answer NO_CONSENT for it anyway: the sentinel only has
 * to be distinguishable, never trusted.
 */
const PENDING = 'pending:the-browser-has-not-been-read'

const ConsentContext = createContext<ConsentContextValue>({
  decision: NO_CONSENT,
  decided: false,
  loading: true,
  acceptAll: () => {},
  refuseAll: () => {},
})

export function useConsent(): ConsentContextValue {
  return useContext(ConsentContext)
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.split('; ').find(c => c.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : null
}

/**
 * What this tab has decided, when the cookie itself could not be written.
 *
 * A browser that refuses cookies cannot be made to remember an answer, and the
 * next page will ask again. It should not, on top of that, ignore the button
 * that was just pressed, so the answer is held for the life of this document.
 */
let answeredInThisTab: string | null = null

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function browserSnapshot(): string {
  return answeredInThisTab ?? readCookie(CONSENT_COOKIE) ?? ''
}

function serverSnapshot(): string {
  return PENDING
}

function writeDecision(decision: ConsentDecision) {
  const encoded = encodeConsent(decision)
  try {
    document.cookie = `${CONSENT_COOKIE}=${encoded}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; samesite=lax`
  } catch {
    // A browser that refuses the cookie has answered: nothing is remembered
    // beyond this document. Nothing to report.
  }
  answeredInThisTab = encoded
  notify()
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot)
  const loading = stored === PENDING

  const decision = useMemo<ConsentDecision>(
    () => (loading ? NO_CONSENT : decodeConsent(stored)),
    [loading, stored],
  )

  const acceptAll = useCallback(() => {
    writeDecision(allGranted())
  }, [])

  const refuseAll = useCallback(() => {
    // A refusal is RECORDED, not merely "not accepted". Without the record the
    // banner would return on the next page and the platform would be asking a
    // person who has already said no, which is both rude and, under the
    // Australian Privacy Principles, a poor answer to "can I withdraw".
    writeDecision(allRefused())
  }, [])

  const value = useMemo<ConsentContextValue>(
    () => ({ decision, decided: hasDecided(decision), loading, acceptAll, refuseAll }),
    [decision, loading, acceptAll, refuseAll],
  )

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
}
