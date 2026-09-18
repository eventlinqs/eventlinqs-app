import type { ReactNode } from 'react'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'

interface PageShellProps {
  children: ReactNode
  /**
   * Render the ANONYMOUS header: no session read, no visitor identity in the
   * markup. Default false, so every existing caller is unchanged.
   *
   * WHO NEEDS IT, and it is not a page (close-out C8, 18 September 2026). The
   * root `not-found.tsx` renders this shell, and Next serialises the root
   * not-found BOUNDARY into the RSC payload of EVERY page, not only into a real
   * 404. Measured on this build, signed in: the 404 copy "We can't find that
   * page" appears once in the response for `/`, for `/events` and for
   * `/events/browse/melbourne`, and so did a second `SiteHeaderClient` carrying
   * the visitor's display name and email address.
   *
   * That is how a publicly edge-cached route kept carrying an identity even
   * after its own header was made `staticSafe`: the identity was not coming
   * from the page.
   */
  staticSafe?: boolean
}

/**
 * PageShell - wraps every non-homepage interior page.
 *
 * Uses a flex-col layout so <main> grows to fill available viewport height,
 * preventing the blank void below the fold on short pages.
 *
 * SiteHeader is h-16 (64px). SiteFooter height is variable.
 * flex-1 on <main> handles the remainder without needing to know footer height.
 */
export function PageShell({ children, staticSafe = false }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader staticSafe={staticSafe} />
      <main className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
