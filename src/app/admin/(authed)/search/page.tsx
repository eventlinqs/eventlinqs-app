import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { globalAdminSearch, type SearchHit } from '@/lib/admin/search'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Search | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ q?: string }>

interface Group {
  title: string
  hits: SearchHit[]
  href: (id: string) => string
  allHref: string
}

function ResultGroup({ title, hits, href, allHref }: Group) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#131A2A]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="font-display text-sm uppercase tracking-widest text-white/60">
          {title} <span className="text-white/40">({hits.length})</span>
        </h2>
        <Link href={allHref} className="text-[11px] uppercase tracking-[0.18em] text-[var(--brand-accent)] hover:underline">
          View all
        </Link>
      </div>
      {hits.length === 0 ? (
        <p className="px-4 py-6 text-sm text-white/40">No matches.</p>
      ) : (
        <ul>
          {hits.map(h => (
            <li key={h.id} className="border-t border-white/[0.04] first:border-t-0">
              <Link href={href(h.id)} className="block px-4 py-3 transition hover:bg-white/[0.03]">
                <span className="block text-sm text-white">{h.primary}</span>
                {h.secondary ? <span className="mt-0.5 block text-xs text-white/45">{h.secondary}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function AdminSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')

  const sp = await searchParams
  const query = sp.q?.trim() ?? ''

  await recordAuditEvent({ action: 'admin.search', session, metadata: { query: query || null } })

  const results = await globalAdminSearch(query)
  const total = results.organisations.length + results.events.length + results.users.length

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Search</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          {query ? `Results for "${query}"` : 'Search'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Find any organiser, event, or user, then open the record. Use the search box in the top bar at any time.
        </p>
      </header>

      <form method="GET" action="/admin/search" className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
        <label className="block flex-1 min-w-[240px]">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Search</span>
          <input
            type="search"
            name="q"
            placeholder="Organiser, event, or user"
            defaultValue={query}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
        <button type="submit" className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]">
          Search
        </button>
      </form>

      {!query ? (
        <p className="rounded-xl border border-white/[0.08] bg-[#131A2A] px-4 py-10 text-center text-white/50">
          Type a name, title, or email above to search across the platform.
        </p>
      ) : total === 0 ? (
        <p className="rounded-xl border border-white/[0.08] bg-[#131A2A] px-4 py-10 text-center text-white/50">
          Nothing matched &quot;{query}&quot;. Try a different name, title, or email.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ResultGroup
            title="Organisers"
            hits={results.organisations}
            href={id => `/admin/organisers/${id}`}
            allHref={`/admin/organisers?q=${encodeURIComponent(query)}`}
          />
          <ResultGroup
            title="Events"
            hits={results.events}
            href={id => `/admin/events/${id}`}
            allHref={`/admin/events?q=${encodeURIComponent(query)}`}
          />
          <ResultGroup
            title="Users"
            hits={results.users}
            href={id => `/admin/users/${id}`}
            allHref={`/admin/users?q=${encodeURIComponent(query)}`}
          />
        </div>
      )}
    </div>
  )
}
