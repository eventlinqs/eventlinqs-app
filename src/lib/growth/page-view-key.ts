/**
 * A PAGE VIEW'S KEY, READ ONE WAY (WINDOW 5A, 17 November 2026). The demand route writes `<event id>:<visitor>:<day>`
 * (src/app/api/ledger/demand/route.ts) and the ledger adapter stores it as `demand:page_view:<event id>:<visitor>:<day>`
 * (src/lib/ledger/adapter.ts, `demand:${action}:`). Every reader of a page view's key goes through here, never a split
 * of its own (tests/unit/growth/page-view-key.test.ts holds that): two readers that split the stored key as if it had
 * no prefix counted every night at most one viewer. A key of another action, or with a part missing, is refused.
 */
const PREFIX = 'demand:page_view:'

export type PageViewKey = { readonly eventId: string; readonly visitor: string; readonly day: string }

export function pageViewKeyParts(key: string): PageViewKey | null {
  if (key.startsWith('demand:') && !key.startsWith(PREFIX)) return null
  const bare = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key
  const [eventId, visitor, day] = bare.split(':')
  if (!eventId || !visitor || !day) return null
  return { eventId, visitor, day }
}
