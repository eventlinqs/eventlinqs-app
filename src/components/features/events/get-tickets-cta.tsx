'use client'

import Link from 'next/link'
import { useCallback } from 'react'

/**
 * THE HERO "GET TICKETS" CALL TO ACTION.
 *
 * FOUNDER RULING, 17 August 2026, from a measurement rather than a hunch. On a
 * phone this control does 2612 to 2768 pixels of real work and is the most
 * important thing on the page. On a desktop the ticket panel's top sits 693px
 * into a 900px viewport, so it is ALREADY ON SCREEN before the button is
 * pressed, and pressing a primary call to action that takes you to something you
 * can already see and use is what the founder found on production and described
 * as doing nothing.
 *
 * SO IT DOES SOMETHING ELSE THERE. At `lg` and above it moves FOCUS to the first
 * usable control inside the ticket panel, which is the quantity control on an
 * ordinary event and the first enabled control on every other variant: the seat
 * selector, the external-tickets link, the waitlist. Focus is meaningful in a way
 * a 693px scroll is not: the caret lands where the next action is, the focus ring
 * says so, and a keyboard user is put exactly where they were trying to get.
 *
 * IT STAYS AN ANCHOR. `href="#tickets"` is the behaviour with no JavaScript, on
 * every viewport, and it is what a middle-click or a copied link does. The
 * handler only intercepts the desktop case, and only when it has somewhere real
 * to send the caret; anything else falls through to the ordinary jump.
 *
 * `preventScroll` is deliberately NOT set, so if the panel is partly below the
 * fold the browser still brings it into view. Focus and scroll are not
 * alternatives here; focus is the part that was missing.
 */
export function GetTicketsCta({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const onClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    // Let a modified click do what the reader asked for: open in a new tab.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (typeof window === 'undefined' || !window.matchMedia) return
    // The same breakpoint the ticket panel uses to sit beside the content
    // rather than below it (`lg:w-[360px]`), so the two cannot drift apart.
    if (!window.matchMedia('(min-width: 1024px)').matches) return

    const panel = document.getElementById('tickets')
    if (!panel) return
    const target = panel.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    if (!target) return

    event.preventDefault()
    target.focus()
  }, [])

  return (
    <Link href="#tickets" className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
