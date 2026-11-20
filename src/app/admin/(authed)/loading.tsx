/**
 * THE ADMIN ANSWERS THE MOMENT A LINK IS PRESSED (P0 of 20 November 2026: Lawal at 15:38, 'it takes forever to load.
 * Nothing on the admin console on the side. Nothing seems to be working'). There was no loading state anywhere under the
 * admin, and every sidebar link is prefetch={false}, so a press showed nothing until the whole next page had rendered on
 * the server: the links looked dead. Next.js's own words (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/loading.md): 'An instant loading state is fallback UI that is shown immediately upon navigation',
 * and 'Navigation is interruptible, meaning changing routes does not need to wait for the content of the route to fully
 * load before navigating to another route.' This is that state for every admin page: the page header's own shape and
 * three cards, in the admin's own tokens, the same size as what replaces it, so nothing shifts. No spinner, no words
 * that claim anything.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-admin-loading>
      <span className="sr-only">Loading this page</span>
      <header className="mb-8 flex flex-col gap-4 border-b border-[var(--admin-line)] pb-6">
        <div className="min-w-0">
          <span className="block h-3 w-20 animate-pulse rounded bg-[var(--admin-tint-strong)]" />
          <span className="mt-3 block h-8 w-64 max-w-full animate-pulse rounded bg-[var(--admin-tint-strong)]" />
          <span className="mt-3 block h-4 w-96 max-w-full animate-pulse rounded bg-[var(--admin-tint-strong)]" />
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
            <span className="block h-3 w-24 animate-pulse rounded bg-[var(--admin-tint-strong)]" />
            <span className="mt-3 block h-7 w-20 animate-pulse rounded bg-[var(--admin-tint-strong)]" />
            <span className="mt-3 block h-3 w-40 max-w-full animate-pulse rounded bg-[var(--admin-tint-strong)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
