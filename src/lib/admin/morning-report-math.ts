/**
 * THE 08:00 REPORT'S SEVEN PARTS (car D, part 2; the operating model, section 10; law 25, Lawal's 11:31 of 18 November
 * 2026: "stop presenting technical abbreviations ... as the main headings in my reports"). One row per business area, in
 * law 25's order, each with what happened yesterday and what stands today, every figure read from production that
 * morning (law 14 (f)) by ./morning-report.ts. When everything works it says so and asks nothing.
 *
 * Pure: the words are built here from the counts, so a test reads every sentence. No code name (ACQ, PERM, SOC, LIST,
 * RET, TKT, SYS) appears in any line, a test is never called delivery, and every count agrees with its noun (law 22).
 */
import { countOf } from '@/lib/text/plural'

/** Law 25's business names, in law 25's order. */
export const BUSINESS_AREAS = [
  'Organiser Marketing',
  'Event Photo Permissions',
  'Social Media Marketing',
  'Event Listings',
  'Organiser Relationships',
  'Ticketing & Revenue',
  'System Operations',
] as const
export type BusinessArea = (typeof BUSINESS_AREAS)[number]

/**
 * Which area a letter belongs to, by its play (law 24: every message has one primary category; the play carries it). An
 * organiser acquisition play is named 'ACQ-FIRST: ...'; the photo permission letters are segment A's ('Segment A: ...').
 * Anything else is null and is counted nowhere rather than guessed.
 */
export function areaOfPlay(name: string | null | undefined): 'Organiser Marketing' | 'Event Photo Permissions' | null {
  const n = (name ?? '').trim()
  if (/^ACQ-FIRST\b/i.test(n)) return 'Organiser Marketing'
  if (/^Segment A\b/i.test(n)) return 'Event Photo Permissions'
  return null
}

export type MorningFacts = {
  /** Each area is null when its read failed: that row says so, and never prints a calm zero. */
  readonly marketing: null | { readonly firstLettersSent: number; readonly positiveReplies: number; readonly readyToday: number }
  readonly permissions: null | { readonly requestsSent: number; readonly photosReceived: number; readonly photosApproved: number; readonly requestsDueToday: number }
  readonly social: null | { readonly published: readonly { readonly platform: string; readonly ref: string | null }[]; readonly scheduledToday: number; readonly held: number }
  readonly listings: null | { readonly published: number; readonly ended: number; readonly onToday: number }
  readonly relationships: null | { readonly repliesReceived: number; readonly waitingForLawal: number }
  readonly ticketing: null | { readonly ordersConfirmed: number; readonly feeRevenueCents: number; readonly activations: number }
  readonly system: null | { readonly failures: readonly { readonly title: string; readonly recovered: boolean | null }[]; readonly unreadable: readonly string[] }
}

export type MorningRow = { readonly area: BusinessArea; readonly yesterday: string; readonly today: string }


/** Australian dollars from cents, never a fraction of a cent: '$0', '$12.50'. */
export function dollars(cents: number): string {
  const whole = Math.round(cents) / 100
  return Number.isInteger(whole) ? `$${whole}` : `$${whole.toFixed(2)}`
}

function platformName(p: string): string {
  return p === 'instagram' ? 'Instagram' : p === 'facebook' ? 'Facebook' : p
}

const UNKNOWN = { yesterday: 'Not known: its records could not be read this morning.', today: 'Not known.' }

export function morningRows(f: MorningFacts): MorningRow[] {
  return BUSINESS_AREAS.map((area) => {
    const row = rowOf(area, f)
    return row ?? { area, ...UNKNOWN }
  })
}

function rowOf(area: BusinessArea, f: MorningFacts): MorningRow | null {
  switch (area) {
    case 'Organiser Marketing':
      return f.marketing && {
        area,
        yesterday: `${countOf(f.marketing.firstLettersSent, 'first letter')} sent to organisers; ${countOf(f.marketing.positiveReplies, 'positive reply', 'positive replies')}.`,
        today: f.marketing.readyToday > 0 ? `${countOf(f.marketing.readyToday, 'first letter')} ready to go.` : 'No first letters queued for today.',
      }
    case 'Event Photo Permissions':
      return f.permissions && {
        area,
        yesterday: `${countOf(f.permissions.requestsSent, 'photo request')} sent; ${countOf(f.permissions.photosReceived, 'photo')} received, ${f.permissions.photosApproved} now in use.`,
        today: f.permissions.requestsDueToday > 0 ? `${countOf(f.permissions.requestsDueToday, 'photo request')} due.` : 'No photo requests due.',
      }
    case 'Social Media Marketing': {
      if (!f.social) return null
      const published = f.social.published
      const byPlatform = [...new Set(published.map((p) => p.platform))].sort().map((p) => `${published.filter((x) => x.platform === p).length} on ${platformName(p)}`)
      return {
        area,
        yesterday: published.length > 0 ? `${countOf(published.length, 'post')} published (${byPlatform.join(', ')}).` : 'No posts published.',
        today:
          `${f.social.scheduledToday > 0 ? `${countOf(f.social.scheduledToday, 'post')} scheduled.` : 'No posts scheduled.'}` +
          (f.social.held > 0 ? ` ${countOf(f.social.held, 'post')} held back with ${f.social.held === 1 ? 'its reason' : 'their reasons'}.` : ''),
      }
    }
    case 'Event Listings':
      return f.listings && {
        area,
        yesterday: `${countOf(f.listings.published, 'event')} published; ${countOf(f.listings.ended, 'event')} ended and left the guides.`,
        today: `${countOf(f.listings.onToday, 'event')} on today across the guides.`,
      }
    case 'Organiser Relationships':
      return f.relationships && {
        area,
        yesterday: `${countOf(f.relationships.repliesReceived, 'reply', 'replies')} from organisers.`,
        today: f.relationships.waitingForLawal > 0 ? `${countOf(f.relationships.waitingForLawal, 'reply', 'replies')} waiting for you.` : 'No replies waiting for you.',
      }
    case 'Ticketing & Revenue':
      return f.ticketing && {
        area,
        yesterday: `${countOf(f.ticketing.ordersConfirmed, 'order')} on EventLinqs ticketing; ${dollars(f.ticketing.feeRevenueCents)} in EventLinqs fees; ${countOf(f.ticketing.activations, 'organiser')} sold a first ticket.`,
        today: 'Conversion opportunities are not measured yet.',
      }
    case 'System Operations': {
      if (!f.system) return null
      const failed = f.system.failures.filter((x) => x.recovered !== true)
      const recovered = f.system.failures.filter((x) => x.recovered === true)
      return {
        area,
        yesterday:
          failed.length === 0 && recovered.length === 0
            ? 'No failures.'
            : [
                failed.length > 0 ? `Not recovered: ${failed.map((x) => x.title).join(', ')}.` : '',
                recovered.length > 0 ? `Failed and recovered by itself: ${recovered.map((x) => x.title).join(', ')}.` : '',
              ].filter(Boolean).join(' '),
        today: failed.length > 0 ? `${countOf(failed.length, 'automation')} to look at; the engine page names each one.` : 'Nothing needs you.',
      }
    }
  }
}

/** Every area working and nothing waiting for Lawal: the report says so and asks nothing. */
export function allWell(f: MorningFacts): boolean {
  const areas = [f.marketing, f.permissions, f.social, f.listings, f.relationships, f.ticketing, f.system]
  if (areas.some((a) => a === null)) return false
  return (f.system?.failures ?? []).every((x) => x.recovered === true) && (f.relationships?.waitingForLawal ?? 0) === 0 && (f.system?.unreadable.length ?? 0) === 0
}
