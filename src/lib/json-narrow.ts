// Narrowing helpers for the Supabase Json union.
//
// The Postgres-generated Row types for jsonb columns are `Json | null`
// where Json = string | number | boolean | null | Json[] | { [k]: Json }.
// At runtime our schema's jsonb columns hold specific shapes (string[]
// arrays for events.tags / events.gallery_urls, plain objects for
// organisations.stripe_requirements, etc.) but TypeScript cannot see
// past Json without a runtime narrow.
//
// These helpers do an explicit runtime check and return the narrowed
// shape OR a safe fallback. They are NOT silent casts: a non-matching
// shape returns the fallback so the consuming code stays consistent.

import type { Database } from '@/types/database'

// The Json union as Supabase emits it. Imported here so call sites can
// stay loose with `Json | null | undefined` without re-deriving.
type Json = Database['public']['Tables']['orders']['Row']['metadata']

// Coerce a Json value to string[]. Filters non-string elements out
// rather than rejecting the whole array. Returns [] when the input is
// not an array (string/number/object/null/undefined all yield []).
export function jsonAsStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v === 'string') out.push(v)
  }
  return out
}

// Coerce a Json value to Record<string, unknown>. Returns null when the
// input is not a plain object (arrays, primitives, null, undefined all
// yield null). The caller decides what to do with null.
export function jsonAsRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return null
  if (typeof value !== 'object') return null
  return value as Record<string, unknown>
}

// Re-export for ergonomics if callers want the union directly.
export type { Json }
