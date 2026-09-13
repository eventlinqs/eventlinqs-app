/**
 * THE ONE PLACE THIS ITEM WRITES A PATH DOWN.
 *
 * GA3 acceptance 9 forbids a route, a slug, a channel code, a window length or
 * a fee appearing as a literal in any file this item adds. A Next.js route is
 * the one thing that cannot be read from somewhere else: the folder name IS the
 * address, so the prefix has to be written once. It is written here, and
 * `tests/unit/growth/attribution-spine.test.ts` asserts that it appears in this
 * file and in the route folder and nowhere else in the item.
 *
 * WHY `/m`. Short, because the code goes in a message and then onto a poster,
 * and every character is one a person can mistype. `/e` and `/s` are already
 * the SHARE addresses (`src/app/e/[code]/page.tsx`, `src/proxy.ts`) and this is
 * a different subsystem with a different owner and a different meaning, so it
 * gets its own prefix rather than overloading one somebody already prints.
 *
 * THE TARGET PATH IS STORED, NOT COMPOSED AT REDIRECT TIME. A link on a poster
 * outlives the code that made it. `eventTargetPath` is called ONCE, at mint
 * time, and the answer is written onto `marketing_link.target_path`; the
 * redirect reads the stored path. That way changing how this function composes
 * a path cannot silently repoint paper that is already on a wall.
 */

/** The tracked link prefix. The route folder is `src/app/m/[code]`. */
export const TRACKED_LINK_PREFIX = '/m'

/** Where an event link lands. Called at MINT time only. */
export function eventTargetPath(eventSlug: string): string {
  const slug = eventSlug.trim()
  if (!slug) throw new Error('eventTargetPath needs an event slug')
  return `/events/${slug}`
}

/** The public address of a tracked link, for a message or a poster. */
export function trackedLinkPath(code: string): string {
  return `${TRACKED_LINK_PREFIX}/${code}`
}

/**
 * The query parameters the redirect appends to the target.
 *
 * They are a CONVENIENCE COPY and nothing depends on them surviving: the code
 * in the path already carries every identifier, which is the whole reason a
 * messaging app stripping the query string costs this system nothing. They are
 * appended so anything downstream that wants the campaign without a lookup can
 * read it, and so a person reading the address bar can see what they are in.
 */
export const CLICK_QUERY_KEYS = {
  click: 'mc',
  campaign: 'mcid',
  channel: 'mch',
} as const

export function appendClickIdentifiers(
  targetPath: string,
  identifiers: { clickId: string; campaignId: string; channelCode: string },
): string {
  const [path, existing] = targetPath.split('?', 2)
  const q = new URLSearchParams(existing ?? '')
  q.set(CLICK_QUERY_KEYS.click, identifiers.clickId)
  q.set(CLICK_QUERY_KEYS.campaign, identifiers.campaignId)
  q.set(CLICK_QUERY_KEYS.channel, identifiers.channelCode)
  return `${path}?${q.toString()}`
}

/** Reads the convenience copy back off a request URL. Trusts nothing. */
export function readClickIdentifiers(query: URLSearchParams): {
  clickId: string | null
  campaignId: string | null
  channelCode: string | null
} {
  const take = (key: string) => {
    const v = (query.get(key) ?? '').trim()
    return v.length > 0 && v.length <= 64 ? v : null
  }
  return {
    clickId: take(CLICK_QUERY_KEYS.click),
    campaignId: take(CLICK_QUERY_KEYS.campaign),
    channelCode: take(CLICK_QUERY_KEYS.channel),
  }
}
