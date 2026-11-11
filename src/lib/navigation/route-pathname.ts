import { usePathname } from 'next/navigation'

/**
 * THE PATH A VISITOR IS ON, THE SAME ON THE SERVER AS IN THE BROWSER (11 November 2026: the cached home's React #418,
 * car 40's open cause, found).
 *
 * THE DEFECT. Vercel's cached render of the home, regenerated after its time window, was made for the path "/index":
 * its embedded router state carries the canonical URL ["", "index"] (read from the cached page's own flight data on
 * the preview of experiment 2, 11 November 2026, 22:2x), where /city/geelong's cached render carries
 * ["", "city", "geelong"]. So `usePathname()` answered "/index" on the server; the mobile bottom bar drew Home as NOT
 * the current page (`pathname === '/'` was false), the browser hydrated at "/" and drew Home as the current page, and
 * React threw #418 and rebuilt the page on the client. The served markup and the client's rebuild differ in that one
 * item and nowhere else in their text or attributes (the bottom bar's Home: aria-current, its colour, its scale, its
 * underline). A render made for a request to "/" itself (age 0) was clean, which is why it looked like time.
 *
 * Next.js documents "/" as the root's pathname (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * use-pathname.md); "/index" is the root's page path, never an address a visitor can be on (the site has no /index
 * route). So the root's alias is read as the root, in this one place, and every component that draws from the path
 * reads it through `useRoutePathname()`. tests/unit/navigation/route-pathname.test.ts fails the build if any file
 * reads `usePathname` directly again.
 */
export function routePathname(raw: string | null | undefined): string {
  if (!raw || raw === '/index') return '/'
  return raw
}

/** `usePathname()`, with the root's page-path alias read as the root. Use this, never `usePathname` itself. */
export function useRoutePathname(): string {
  return routePathname(usePathname())
}
