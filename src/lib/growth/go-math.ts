/**
 * /go, THE LINK IN BIO (the EventLinqs engine plan of 28 October 2026, part H; Lawal's final directive of that day: "A
 * button drawn in an image is not a link. The image shows a label only ("Link in bio" or the domain); the real path is
 * the profile link page ... Build eventlinqs.com.au/go: a fast link page listing each live post's tracked link").
 *
 * WHICH PIECES ARE LISTED. A piece of a weekly campaign (20261028141001) that went to Instagram or Facebook (a
 * social_piece_postings row with a post address; a partner kit, which is sent and never posted, is not listed), as it
 * was approved: the approved revision's hook is its words and its nights are the nights it named. It stays while one of
 * those nights is still ahead and still public; a piece that names no night (the organiser campaign) stays for
 * NO_NIGHT_DAYS after it went. Newest post first, each piece once.
 *
 * WHERE A PRESS GOES. Through /go/[piece], which counts the press (go_presses) and then lands the visitor on the piece's
 * own stored link, on THIS site: the stored link's path and query are kept and its host is replaced by the request's
 * own, so the hop can never be pointed anywhere else (never an open redirect), and a link that cannot be read lands on
 * /events (Law 5). The landing carries utm tags, so the visit ledger's channel rules (traffic-channel.ts) count it as
 * social, from the profile the /go page was opened from.
 *
 * A press is an arrival, never a sale (K14).
 *
 * Pure: src/lib/growth/go.ts reads the rows.
 */

export const NO_NIGHT_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export const GO_VIAS = ['instagram', 'facebook', 'other'] as const
export type GoVia = (typeof GO_VIAS)[number]

export interface GoNight {
  readonly id: string
  readonly startDate: string
  readonly endDate: string
  /** The night's own time zone, its date said in it. */
  readonly timezone: string | null
  /** Public now: published and visible to anyone (src/lib/events/public-visibility.ts as read by go.ts). */
  readonly isPublic: boolean
}

export interface GoPieceRow {
  readonly id: string
  readonly kind: string
  readonly city: string
  readonly link: string
  readonly postUrl: string
  readonly postedAt: string
  /** The approved revision's Instagram hook. */
  readonly hook: string
  /** The nights the approved revision named. */
  readonly nightIds: readonly string[]
}

export interface GoLink {
  readonly pieceId: string
  readonly words: string
  /** The first night still ahead, for the date said beside the words; null for a piece that names no night. */
  readonly nextNightStart: string | null
  readonly nextNightZone: string | null
  readonly postedAt: string
}

/** The profile a /go page was opened from, as its own link names it (/go?via=facebook); anything else is 'instagram', the bio it was made for. */
export function viaOf(raw: string | null | undefined): GoVia {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === '') return 'instagram'
  return (GO_VIAS as readonly string[]).includes(v) ? (v as GoVia) : 'other'
}

/** The pieces /go lists now: went to a platform, approved, a night still ahead and public (or recent with no night), newest first, once each. */
export function liveGoLinks(pieces: readonly GoPieceRow[], nights: ReadonlyMap<string, GoNight>, now: Date): GoLink[] {
  const t = now.getTime()
  const seen = new Set<string>()
  const out: GoLink[] = []
  const newestFirst = [...pieces].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt) || a.id.localeCompare(b.id))
  for (const p of newestFirst) {
    if (seen.has(p.id)) continue
    if (p.kind === 'partner_kit' || !/^https:\/\//i.test(p.postUrl)) continue
    if (p.hook.trim() === '') continue
    const posted = Date.parse(p.postedAt)
    if (!Number.isFinite(posted) || posted > t) continue
    let nextNightStart: string | null = null
    let nextNightZone: string | null = null
    if (p.nightIds.length === 0) {
      if (t - posted > NO_NIGHT_DAYS * DAY_MS) continue
    } else {
      const ahead = p.nightIds
        .map((id) => nights.get(id))
        .filter((n): n is GoNight => n !== undefined && n.isPublic && Date.parse(n.endDate) > t)
        .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
      if (ahead.length === 0) continue
      nextNightStart = ahead[0].startDate
      nextNightZone = ahead[0].timezone
    }
    seen.add(p.id)
    out.push({ pieceId: p.id, words: p.hook.trim(), nextNightStart, nextNightZone, postedAt: p.postedAt })
  }
  return out
}

/**
 * Where a press on /go/[piece] lands: the piece's stored link's path and query on the request's own origin, tagged for
 * the visit ledger. Never another host, whatever the stored link or the request says; an unreadable link is /events.
 */
export function goDestination(storedLink: string | null, requestOrigin: string, via: GoVia): string {
  const origin = new URL(requestOrigin).origin
  let landing: URL
  try {
    if (storedLink === null || !/^https:\/\//i.test(storedLink)) throw new Error('no stored link')
    const stored = new URL(storedLink)
    landing = new URL(`${stored.pathname}${stored.search}`, origin)
  } catch {
    landing = new URL('/events', origin)
  }
  if (landing.origin !== origin || !landing.pathname.startsWith('/') || landing.pathname.startsWith('//')) {
    landing = new URL('/events', origin)
  }
  landing.searchParams.set('utm_source', via)
  landing.searchParams.set('utm_medium', 'social')
  landing.searchParams.set('utm_campaign', 'go')
  return landing.toString()
}

/** The Melbourne day a press falls on, as YYYY-MM-DD (one press per visitor per piece per day). */
export function pressDay(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
