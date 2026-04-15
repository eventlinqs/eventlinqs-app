import type { ReactNode } from 'react'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'

interface PageShellProps {
  children: ReactNode
}

/**
 * PageShell — wraps every non-homepage interior page.
 *
 * Uses a flex-col layout so <main> grows to fill available viewport height,
 * preventing the blank void below the fold on short pages.
 *
 * SiteHeader is h-16 (64px). SiteFooter height is variable.
 * flex-1 on <main> handles the remainder without needing to know footer height.
 */
export function PageShell({ children }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
