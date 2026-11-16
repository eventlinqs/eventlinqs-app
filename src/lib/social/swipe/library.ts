/**
 * THE SWIPE LIBRARY (EL-M2; the PM's 01:30 of 16 November 2026 on Lawal's 01:17, C:\dev\START-16OCT\MARKETING-ENGINEERING-16NOV.md):
 * one library the renderer, the windows and the PM all read. Our own 22 locked posts of SOCIAL-READY-15NOV, each with a
 * line on why it works (the PM's lock scores of 15 November, social-14nov/review/score-lock-0840 to 0950), and each week
 * at least five of the best current posts of the leaders, held as link, date and notes only: what it does, what we take.
 * Never a copy of their images: an entry holds no image file (swipeRefusals, held by its test). Shown read only on
 * /admin/automation.
 */

export type SwipeFamily = 'A weekly carousel' | 'B free and tonight' | 'C organiser spotlight' | 'D event hero' | 'E venue' | 'F the week in stories' | 'G for organisers'

export type OurPost = {
  readonly n: number
  /** Its folder in the locked set, beside the repository: START-16OCT/SOCIAL-READY-15NOV/<folder>. */
  readonly folder: string
  readonly family: SwipeFamily
  readonly where: 'Instagram feed' | 'Instagram story' | 'Instagram carousel' | 'Instagram stories' | 'Facebook'
  readonly why: string
}

export type Reference = {
  readonly leader: 'Time Out' | 'Broadsheet' | "What's On Melbourne" | 'Ticketmaster AU' | 'Eventbrite' | 'Humanitix' | 'Resident Advisor' | 'DICE'
  readonly title: string
  readonly link: string
  /** The day it was looked at, YYYY-MM-DD. */
  readonly seen: string
  readonly does: string
  readonly take: string
}

export const LOCKED_SET = 'START-16OCT/SOCIAL-READY-15NOV'

const WHY: Record<SwipeFamily, string> = {
  'A weekly carousel': 'The week in one carousel: the cover names the biggest draws, then day slides of three or four nights on gold timed cards, headliners first.',
  'B free and tonight': 'Free and tonight in one look: every headline line whole, a photograph of the right kind with a hard edge, the credit small at its edge.',
  'C organiser spotlight': "An organiser's own night in the spotlight, their flyer shown large, a short tracked link only where a link must show.",
  'D event hero': 'One night as the hero: its own photograph where it has one, the facts beneath it, no empty third, Link in bio never a raw address.',
  'E venue': "A venue's week led by a photograph of the right kind, three or more nights, never a thin venue.",
  'F the week in stories': 'The week told in stories, the cover then its list, every frame filled to the sticker foot, never a cover alone.',
  'G for organisers': 'The offer to the people who run nights, said plainly, to the organisers page.',
}

const post = (n: number, folder: string, family: SwipeFamily, where: OurPost['where']): OurPost => ({ n, folder, family, where, why: WHY[family] })

export const OURS: readonly OurPost[] = [
  post(1, '01-sun-15-1300-tonight-story', 'B free and tonight', 'Instagram story'),
  post(2, '02-sun-15-1700-free-this-week-feed', 'B free and tonight', 'Instagram feed'),
  post(3, '03-sun-15-1705-free-this-week-story', 'B free and tonight', 'Instagram story'),
  post(4, '04-sun-15-1710-free-this-week-facebook', 'B free and tonight', 'Facebook'),
  post(5, '05-mon-16-1200-comedy-republic-feed', 'E venue', 'Instagram feed'),
  post(6, '06-mon-16-1205-comedy-republic-story', 'E venue', 'Instagram story'),
  post(7, '07-mon-16-1210-comedy-republic-facebook', 'E venue', 'Facebook'),
  post(8, '08-mon-16-1400-the-week-carousel', 'A weekly carousel', 'Instagram carousel'),
  post(9, '09-mon-16-1405-the-week-stories', 'F the week in stories', 'Instagram stories'),
  post(10, '10-mon-16-1410-the-week-facebook', 'A weekly carousel', 'Facebook'),
  post(11, '11-tue-17-1300-lany-feed', 'D event hero', 'Instagram feed'),
  post(12, '12-tue-17-1305-lany-facebook', 'D event hero', 'Facebook'),
  post(13, '13-tue-17-1700-organisers-feed', 'G for organisers', 'Instagram feed'),
  post(14, '14-tue-17-1705-organisers-story', 'G for organisers', 'Instagram story'),
  post(15, '15-tue-17-1710-organisers-facebook', 'G for organisers', 'Facebook'),
  post(16, '16-wed-18-1200-lany-story', 'D event hero', 'Instagram story'),
  post(17, '17-wed-18-1800-groovytown-feed', 'C organiser spotlight', 'Instagram feed'),
  post(18, '18-wed-18-1805-groovytown-story', 'C organiser spotlight', 'Instagram story'),
  post(19, '19-wed-18-1810-groovytown-facebook', 'C organiser spotlight', 'Facebook'),
  post(20, '20-thu-19-1200-amcf-feed', 'D event hero', 'Instagram feed'),
  post(21, '21-thu-19-1205-amcf-facebook', 'D event hero', 'Facebook'),
  post(22, '22-fri-20-1000-amcf-story', 'D event hero', 'Instagram story'),
]

/**
 * The first five references, each looked at on the leader's own public page on 14 November 2026 (Instagram is not read
 * by a robot, so their posts are read from their own pages: C:\dev\START-16OCT\social-14nov\BENCHMARKS-social.md, the
 * captures beside it). Each week adds at least five more.
 */
export const REFERENCES: readonly Reference[] = [
  {
    leader: 'Time Out',
    title: 'The best things to do in Melbourne this weekend',
    link: 'https://www.timeout.com/melbourne/things-to-do/things-to-do-in-melbourne-this-weekend',
    seen: '2026-11-14',
    does: 'A weekly list, every entry led by its own full-width photograph, then a very large bold headline over a one-line promise.',
    take: 'The weight of that headline on our poster slides; we keep the photograph whole and its credit beneath it, never over it.',
  },
  {
    leader: 'Broadsheet',
    title: 'Melbourne, things to do this week',
    link: 'https://www.broadsheet.com.au/melbourne/search/things-to-do/this-week',
    seen: '2026-11-14',
    does: 'Each listing a photograph in one shape, a small-capitals date line, a serif title and a one-line description.',
    take: 'The editorial order our cards follow: the photograph on top, then the date line, the title and one line.',
  },
  {
    leader: "What's On Melbourne",
    title: "What's on this weekend",
    link: 'https://whatson.melbourne.vic.gov.au/things-to-do/this-weekend',
    seen: '2026-11-14',
    does: 'Photo-led tiles for the weekend, free events flagged on the tile.',
    take: 'Free said on the card itself, as our free and tonight posts do.',
  },
  {
    leader: 'Eventbrite',
    title: 'Share your event (the organiser kit)',
    link: 'https://www.eventbrite.com/help/en-us/articles/671107/share-your-event/',
    seen: '2026-11-14',
    does: 'Pre-made flyer graphics from the event dashboard, with a route into Canva.',
    take: "The organiser's kit made for them from their own listing, with their own link, ready to post.",
  },
  {
    leader: 'Humanitix',
    title: 'The Promotional Hub',
    link: 'https://help.humanitix.com/en/articles/8913665-communicate-your-events-impact-using-the-promotional-hub',
    seen: '2026-11-14',
    does: 'Canva templates downloaded as PNG or JPEG, each with a suggested caption, the link and a QR code.',
    take: 'A suggested caption, the link and the QR code with every kit we send.',
  },
]

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|avif|heic|svg)(\?|#|$)/i

/** What the library refuses: a reference with no link, no date, no notes or an image file; ours missing its why. */
export function swipeRefusals(ours: readonly OurPost[] = OURS, references: readonly Reference[] = REFERENCES): string[] {
  const out: string[] = []
  for (const r of references) {
    if (!/^https:\/\/\S+$/.test(r.link)) out.push(`${r.leader}, ${r.title}: no link`)
    if (IMAGE_FILE.test(r.link)) out.push(`${r.leader}, ${r.title}: an image file, never kept`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.seen) || Number.isNaN(Date.parse(`${r.seen}T00:00:00Z`))) out.push(`${r.leader}, ${r.title}: no date`)
    if (r.does.trim().length < 10 || r.take.trim().length < 10) out.push(`${r.leader}, ${r.title}: no notes`)
  }
  const folders = new Set<string>()
  for (const p of ours) {
    if (p.why.trim().length < 10) out.push(`our ${p.n}: no line on why it works`)
    if (IMAGE_FILE.test(p.folder)) out.push(`our ${p.n}: an image file, the folder is kept`)
    if (folders.has(p.folder)) out.push(`our ${p.n}: its folder twice`)
    folders.add(p.folder)
  }
  return out
}
