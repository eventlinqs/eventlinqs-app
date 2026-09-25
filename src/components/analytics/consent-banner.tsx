'use client'

import { useEffect } from 'react'
import { useConsent } from './consent-provider'
import {
  CONSENT_ASK_ATTRIBUTE,
  CONSENT_ASK_VALUE,
  CONSENT_BANNER_HEIGHT_VAR,
  CONSENT_INTENT_ACCEPT,
  CONSENT_INTENT_ATTRIBUTE,
  CONSENT_INTENT_REFUSE,
  CONSENT_INTENT_WINDOW_KEY,
  CONSENT_SHELL_ID,
} from '@/lib/analytics/consent-first-paint'

/**
 * THE BANNER'S BEHAVIOUR. The banner itself is server rendered in
 * `consent-banner-shell.tsx`; this renders NOTHING and wires that strip up.
 *
 * Close-out AN1, corrected 21 September 2026. This file used to render the
 * strip, and because it sits inside the lazily fetched measurement tree the
 * strip could not appear until React had hydrated and a second chunk had
 * arrived. On a throttled phone that is about four seconds, for a full width
 * block of text that is the largest contentful element on the screen: it became
 * the LCP element on five of the thirteen gated URLs and took /events below its
 * performance floor. The markup moved into the server HTML and the reveal moved
 * into a pre-paint script. `lib/analytics/consent-first-paint.ts` carries the
 * whole reasoning.
 *
 * SO WHAT IS LEFT HERE IS THE PART THAT GENUINELY NEEDS THE DEFERRED CHUNK:
 * the consent context. This component still reads it, is still rendered inside
 * `measurement-stack.tsx`, and
 * `tests/unit/analytics/consent-context-stays-in-the-deferred-tree.test.ts`
 * still holds that shape.
 *
 * THE PROVIDER REMAINS THE ONLY WRITER OF THE COOKIE. The inline bootstrap
 * beneath the strip records a press and takes the strip down immediately, so no
 * button is ever a control that does nothing; it writes nothing. This applies
 * that held answer through `acceptAll` / `refuseAll` the moment it mounts, and
 * from then on the presses come straight here.
 */
export function ConsentBanner() {
  const { decided, loading, acceptAll, refuseAll } = useConsent()

  /*
   * A PRESS MADE BEFORE THIS CHUNK ARRIVED. The strip is visible from the first
   * paint, so somebody can answer it seconds before any of this exists. The
   * bootstrap holds that answer on the window rather than writing it, because a
   * second writer of a consent cookie is a second chance to disagree about
   * whether somebody said yes.
   */
  useEffect(() => {
    if (loading) return
    const held = window as unknown as Record<string, unknown>
    const intent = held[CONSENT_INTENT_WINDOW_KEY]
    if (intent !== CONSENT_INTENT_ACCEPT && intent !== CONSENT_INTENT_REFUSE) return
    delete held[CONSENT_INTENT_WINDOW_KEY]
    if (intent === CONSENT_INTENT_ACCEPT) acceptAll()
    else refuseAll()
  }, [loading, acceptAll, refuseAll])

  /*
   * THE STRIP, KEPT IN STEP WITH THE REAL DECISION, AND ITS SPACE RESERVED.
   *
   * Measured at 390 on 14 September 2026 before any of this existed: the strip
   * stood 286 pixels tall, /admin/login does not scroll, and the Sign in button
   * sat entirely underneath it. Sign in was unreachable. /login was the same,
   * and on /organisers the whole mobile bottom bar, five controls, was covered.
   * The bootstrap sets the height at first paint from a real measurement; the
   * observer here keeps it true through a rotation and through a late web font.
   *
   * NOTHING RUNS WHILE `loading` IS TRUE. That is the one render where the
   * browser has not been read yet, and acting on it would take the strip down
   * in front of somebody the pre-paint script had correctly decided to ask.
   */
  useEffect(() => {
    if (loading) return
    const root = document.documentElement
    const shell = document.getElementById(CONSENT_SHELL_ID)
    if (!shell) return

    if (decided) {
      root.removeAttribute(CONSENT_ASK_ATTRIBUTE)
      root.style.removeProperty(CONSENT_BANNER_HEIGHT_VAR)
      return
    }

    root.setAttribute(CONSENT_ASK_ATTRIBUTE, CONSENT_ASK_VALUE)
    const write = () =>
      root.style.setProperty(CONSENT_BANNER_HEIGHT_VAR, `${Math.ceil(shell.getBoundingClientRect().height)}px`)
    write()
    const observer = new ResizeObserver(write)
    observer.observe(shell)

    const onClick = (event: MouseEvent) => {
      const pressed = event.target instanceof Element ? event.target.closest(`[${CONSENT_INTENT_ATTRIBUTE}]`) : null
      const answer = pressed?.getAttribute(CONSENT_INTENT_ATTRIBUTE)
      if (answer !== CONSENT_INTENT_ACCEPT && answer !== CONSENT_INTENT_REFUSE) return
      // The bootstrap recorded the same press a moment ago; clearing it here
      // stops a stale answer being replayed at a later mount.
      delete (window as unknown as Record<string, unknown>)[CONSENT_INTENT_WINDOW_KEY]
      if (answer === CONSENT_INTENT_ACCEPT) acceptAll()
      else refuseAll()
    }
    shell.addEventListener('click', onClick)

    return () => {
      observer.disconnect()
      shell.removeEventListener('click', onClick)
    }
  }, [loading, decided, acceptAll, refuseAll])

  return null
}
