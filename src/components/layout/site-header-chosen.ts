/**
 * THE ONE LINE THAT PICKS THE HEADER'S LOOK (SITE_LOOK.whiteHeader, src/lib/home/site-look.ts; law 13).
 *
 * WHY A RE-EXPORT AND NOT A BRANCH. First Load JS is the union of every client module a route's server graph imports,
 * rendered or not (scripts/perf/lib/first-load.mjs, from Next's own route-bundle-stats), and the header is on every
 * route. A branch in site-header.tsx importing both looks would charge the navy header's code to every page while it is
 * never drawn. So only the chosen look is imported, and tests/component/layout/white-header.test.tsx fails when this
 * line and SITE_LOOK.whiteHeader disagree. To bring the navy header back: set the flag false and export
 * SiteHeaderClient from './site-header-client' here.
 */
export { SiteHeaderWhite as SiteHeaderChosen } from './site-header-white'
