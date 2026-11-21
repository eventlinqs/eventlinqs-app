/**
 * THE NEW LOOK, AS FLAGS (law 46 and the design engine, C:\dev\START-16OCT\DESIGN-ENGINE-LOCKED-21NOV.md, Lawal's
 * 04:15, 04:25 and 04:35 of 21 November 2026; the PM's 13:04 that day: "the white header with search and location ...
 * and the marketplace homepage (site.html)"). The website is a marketplace: a white header with search and location on
 * every page, and a homepage that is find, filter, save and buy.
 *
 * Law 13: the old look is hidden behind these, never deleted. Set one false and that surface returns to the look it
 * had before (the solid navy dual state header, src/components/layout/site-header-client.tsx; the city guide home,
 * src/components/features/city-guide/city-guide-screen.tsx) with one line and a deploy, as AFTER_THE_GUIDE does for
 * the home's sections (src/lib/home/after-the-guide.ts).
 */
export const SITE_LOOK = {
  /** The white marketplace header on every page (src/components/layout/site-header-white.tsx). */
  whiteHeader: true,
  /** The marketplace homepage (src/components/features/home-market/marketplace-home.tsx). */
  marketplaceHome: true,
} as const
