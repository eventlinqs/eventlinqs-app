import { createAdminClient } from '@/lib/supabase/admin'
import { listProfiles } from '@/lib/admin/users'

/**
 * Cross-entity admin search. Backs the topbar search box: one query resolves
 * matching organisers, events, and users so an operator can jump straight to
 * any record. Each group is capped; the results page links to the full
 * filtered list per section for more.
 */

export interface SearchHit {
  id: string
  primary: string
  secondary: string | null
}

export interface AdminSearchResults {
  query: string
  organisations: SearchHit[]
  events: SearchHit[]
  users: SearchHit[]
}

const LIMIT = 8

export async function globalAdminSearch(query: string): Promise<AdminSearchResults> {
  const q = query.trim()
  const base: AdminSearchResults = { query: q, organisations: [], events: [], users: [] }
  if (!q) return base

  const db = createAdminClient()
  const term = `%${q}%`

  const [orgRes, evRes, users] = await Promise.all([
    db.from('organisations').select('id, name, slug').or(`name.ilike.${term},slug.ilike.${term}`).limit(LIMIT),
    db.from('events').select('id, title, slug, status').or(`title.ilike.${term},slug.ilike.${term}`).limit(LIMIT),
    listProfiles({ search: q, page: 1 }).catch(() => null),
  ])

  const orgRows = (orgRes.data ?? []) as Array<Record<string, unknown>>
  const evRows = (evRes.data ?? []) as Array<Record<string, unknown>>

  return {
    query: q,
    organisations: orgRows.map(o => ({
      id: o.id as string,
      primary: o.name as string,
      secondary: (o.slug as string | null) ?? null,
    })),
    events: evRows.map(e => ({
      id: e.id as string,
      primary: e.title as string,
      secondary: ((e.status as string | null) ?? null),
    })),
    users: (users?.rows ?? []).slice(0, LIMIT).map(u => ({
      id: u.id,
      primary: u.name ?? u.email,
      secondary: u.name ? u.email : null,
    })),
  }
}
