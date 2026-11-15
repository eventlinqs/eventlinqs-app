import type { NightKind } from './campaign'
import { creditLine } from '@/lib/media/photo-credits'

/**
 * THE STAND-IN PHOTOGRAPHS (Lawal, 7 November 2026, restated by the PM at 16:02 on 15 November: "General photos of the
 * right kind of event are the stopgap until Lawal's photos arrive"). Licensed photographs of a KIND of night, chosen and
 * looked at by WINDOW 6 on 15 November 2026 (C:/dev/EVIDENCE/EL-15NOV/social-w6/photos/register.json), each drawn only
 * across the top of a day slide whose lead night is of its kind, credited on its edge and named in the caption as what it
 * is, never as the night's own: "Pictured: a gig crowd, a photograph from Pexels, not this night".
 *
 * The licence: https://www.pexels.com/license/ (read 15 November 2026): "All photos and videos on Pexels can be
 * downloaded and used for free." "Attribution is not required." We credit every one anyway.
 *
 * Never a building, never another city: the festival crowd (Pexels 32072177) was withdrawn at 16:20 on 15 November,
 * as its tents carry Sao Paulo's signs. A talk, a recital or a festival stays in type until one of its kind is licensed.
 *
 * Served from our own origin (public/social/stand-ins), so a post never hot links a third party; a slide draws one only
 * while production's photo register holds it as a brand photograph usable for social (social_brand_images), so a
 * withdrawal there takes it off every post that is not yet published.
 */
export type StandIn = {
  /** The Pexels photo id. */
  id: string
  kind: NightKind
  /** What the photograph shows, as the caption says it. */
  subject: string
  photographer: string
  /** The Pexels page it was taken from. */
  page: string
}

export const STAND_INS: readonly StandIn[] = [
  { id: '1763067', kind: 'gig', subject: 'a gig crowd', photographer: 'Sebastian Ervi', page: 'https://www.pexels.com/photo/silhouette-of-people-in-front-of-stage-1763067/' },
  { id: '1047442', kind: 'gig', subject: 'a gig crowd', photographer: 'anna-m. w.', page: 'https://www.pexels.com/photo/people-enjoying-the-concert-1047442/' },
  { id: '21790480', kind: 'gig', subject: 'a concert crowd', photographer: 'Benjamin Farren', page: 'https://www.pexels.com/photo/silhouette-of-raised-arms-in-crowd-at-concert-21790480/' },
  { id: '1105666', kind: 'gig', subject: 'a gig crowd', photographer: 'Vishnu R Nair', page: 'https://www.pexels.com/photo/people-at-concert-1105666/' },
  { id: '23522931', kind: 'comedy', subject: 'a comedy stage', photographer: 'Gezer Amorim', page: 'https://www.pexels.com/photo/black-and-white-photograph-of-a-microphone-on-a-stage-and-spotlight-reflections-23522931/' },
  { id: '8186273', kind: 'comedy', subject: 'a comedy stage', photographer: 'Brett Sayles', page: 'https://www.pexels.com/photo/microphone-on-stand-placed-on-stage-with-green-lights-8186273/' },
  { id: '9419374', kind: 'jazz', subject: 'a jazz club', photographer: 'cottonbro studio', page: 'https://www.pexels.com/photo/photo-of-a-woman-singing-near-musicians-9419374/' },
]

/** Where a stand-in is served: our own origin, never the photographer's site. */
export function standInUrl(origin: string, s: Pick<StandIn, 'id'>): string {
  return `${origin.replace(/\/$/, '')}/social/stand-ins/${s.id}.jpg`
}

/** Its credit on the slide's edge, printed through the one credit line (src/lib/media/photo-credits.ts). */
export function standInCredit(s: Pick<StandIn, 'photographer'>): string {
  return creditLine(`${s.photographer} / Pexels`) ?? `${s.photographer} / Pexels`
}

/** The stand-in a URL names, or null: a slide's photograph is a stand-in only when it is one of these. */
export function standInOf(url: string | null | undefined): StandIn | null {
  const m = url ? /\/social\/stand-ins\/(\d+)\.jpg$/.exec(url) : null
  return m ? (STAND_INS.find((s) => s.id === m[1]) ?? null) : null
}

/**
 * A chooser for one piece: each call takes the next stand-in of the kind asked, so no photograph is used twice in a piece
 * while another of its kind is unused (the photo system's P1, one photograph, one place).
 */
export function standInChooser(seed = ''): (kind: NightKind | null) => StandIn | null {
  const used = new Set<string>()
  // A piece's own starting place in each kind's photographs (out-10, 15 November 2026: one gig crowd led Melbourne's,
  // Geelong's and Bendigo's weeks alike): the seed (the piece's city and its own heading) turns the pool, so posts
  // differ; the same seed always draws the same photograph, so a re-render never changes a post.
  let turn = 0
  for (const ch of seed) turn = (turn * 31 + ch.charCodeAt(0)) % 9973
  return (kind) => {
    if (!kind) return null
    const base = STAND_INS.filter((s) => s.kind === kind)
    const pool = base.length ? [...base.slice(turn % base.length), ...base.slice(0, turn % base.length)] : base
    const pick = pool.find((s) => !used.has(s.id)) ?? null
    if (pick) used.add(pick.id)
    return pick
  }
}
