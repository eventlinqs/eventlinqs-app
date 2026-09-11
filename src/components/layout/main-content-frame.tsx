'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { bottomNavHiddenOn } from './mobile-bottom-nav'

/**
 * The wrapper around every page, and the one place the mobile bar's height is
 * reserved (close-out UX5).
 *
 * WHY IT IS A COMPONENT AND NOT TWO CLASSES ON A DIV. It used to be exactly
 * that: `<div id="main-content" className="pb-16 md:pb-0">` in the root layout,
 * reserving 64px for `MobileBottomNav` on every page unconditionally. But that
 * bar returns null on ten route prefixes, and NONE of them renders SiteFooter,
 * which is the thing that paints the reserved strip everywhere else. So on the
 * admin console, the organiser dashboard, checkout and seven others, the
 * platform held 64px open at the bottom of the page for a bar that is never
 * drawn, and the page background showed through it.
 *
 * MEASURED, on /admin/enrol-2fa at 390 on 11 September 2026: the console's dark
 * shell ended at 1217px and the document was 1281px tall, so 64px of
 * rgb(250,250,247) sat under a dark surface. On a phone that is the strip a
 * thumb rests on.
 *
 * WHY HERE RATHER THAN IN EACH SHELL. The alternative was the site footer's
 * `-mb-16 pb-16` trick repeated in seven shells, which is the same decision
 * written seven times and a bet that the eighth remembers. This removes the
 * cause instead: the space is reserved where the bar exists, and nowhere else.
 *
 * WHY NOT CSS. The first attempt was
 * `#main-content:not(:has(~ [data-mobile-bottom-nav]))` in globals.css, and it
 * was DROPPED ENTIRELY by the build: the emitted stylesheet contained zero
 * occurrences of `:has(`, so the rule silently never shipped. A fix that
 * depends on the toolchain keeping a selector it is willing to discard is not a
 * fix. The pathname is a fact this component can read directly.
 *
 * This is a client component only so it can read the pathname; `children` are
 * passed through untouched and stay server-rendered.
 */
export function MainContentFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/'
  const barAbsent = bottomNavHiddenOn(pathname)
  return (
    <div id="main-content" className={barAbsent ? undefined : 'pb-16 md:pb-0'}>
      {children}
    </div>
  )
}
