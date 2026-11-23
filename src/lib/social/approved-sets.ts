import { APPROVED_FILE_PREFIX, isApprovedFileUrl, type PieceKind, type Slide } from './campaign'

/**
 * LAWAL'S APPROVED SETS, AS DATA (the founder, 23 November 2026, 14:34: "the smallest car that lets the engine publish
 * designed artwork (the creative policy's designed artwork kind, nothing more) and loads the approved files ... with the
 * engine's own captions, windows and Facebook links: comedy carousel (cover plus three shows), live music carousel (cover
 * plus four choices), Kyivska carousel (poster plus why go) ... Windows: comedy and music before Friday 27 November
 * evening; Kyivska before Saturday 5 December."; the creative policy of 13:41, law37.ts).
 *
 * Each set is its name, Lawal's approved files in slide order (public/social/approved/, converted from the approved PNGs
 * of C:\dev\EVIDENCE\EL-23NOV\claude-design\APPROVED-1305 at 1080 by 1350, JPEG quality 92, nothing else changed) and the
 * nights it shows, by id. The engine draws each set once (store.ts drawApprovedSet), its words its own (campaign.ts
 * planApprovedSet), never approved there; the PM's review approves it, and the ordinary scheduler gives it its band.
 *
 * The kind is the family whose day of the week the set leans to (daily-rhythm.ts WEEKLY_RHYTHM), inside the window the
 * timing engine reads from its own nights (timing.ts: until two hours before its first night begins): the comedy weekend
 * Thursday, the live music Friday on the Wednesday before it, and Kyivska Perepichka on a Tuesday, five to fourteen days
 * out. Each kind is one a city a week in a campaign (social_pieces_once), and no two sets share one.
 */

export type ApprovedSetName = 'comedy-weekend' | 'live-music' | 'kyivska-perepichka'

export type ApprovedSet = {
  readonly name: ApprovedSetName
  /** What the set is, in the words its piece and its answers say. */
  readonly label: string
  /** The family it is drawn as: its lean in the weekly rhythm, and its place in the week's campaign. */
  readonly kind: PieceKind
  /** Lawal's approved files, in slide order: plain names under /social/approved/ on www. */
  readonly files: readonly string[]
  /** The nights it shows, by id: every one is read again at intake, approval, scheduling and publishing. */
  readonly eventIds: readonly string[]
  /** The order's own words for its window, said beside the timing engine's. */
  readonly window: string
}

export const APPROVED_SETS: readonly ApprovedSet[] = [
  {
    name: 'comedy-weekend',
    label: 'comedy weekend at Comedy Republic, Friday 27 to Sunday 29 November',
    kind: 'weekend_carousel',
    files: ['comedy-weekend-cover-2026-11-27.jpg', 'comedy-weekend-shows-2026-11-27.jpg'],
    eventIds: [
      // The improv show: Friday 5 pm and 6.30 pm, Saturday 6.30 pm.
      'ecd0776e-e5c9-4a9e-9641-185c2cf750b3',
      'b772a3ad-88a9-4a8f-bff5-aa3348b7a503',
      '152f235f-6a42-44bf-aeef-d03530f13af4',
      // Comedy Republic Main Stage: Friday and Saturday 8 pm.
      '11ac88ce-b5fd-4aa6-b2c6-78aa6bea3f89',
      'dccd097f-be36-4ad0-bc53-09018758c117',
      // Sunday Laughternoons, Sunday 4 pm (never c4381b2c, the improv troupe's '& Friends' show, a different night).
      '7e2d2595-783f-4b5d-9485-6f829c954417',
    ],
    window: 'before Friday 27 November evening',
  },
  {
    name: 'live-music',
    label: 'live music, Friday 27 November',
    kind: 'category_spotlight',
    files: ['live-music-cover-2026-11-27.jpg', 'live-music-choices-2026-11-27.jpg'],
    eventIds: [
      // Choir 3006 In Concert, 6 pm.
      '922537f7-cda5-4a9f-b33d-591c4b3fe983',
      // Joel Ross (NYC), 7 pm and 9.30 pm.
      'd8c93296-4adf-4c7a-97d1-0db8f2191782',
      'ed17c309-64e7-4107-a949-fbeae77872fa',
      // Jack Jones: Hits & Stories, 7.30 pm.
      'd5fa4ea4-6f8b-4c88-93ef-e3ecfc651adc',
      // Michelle Nicolle & David McEvoy, 8.30 pm.
      'e0fd99c3-4607-48ab-987a-b2a3d4ccc5c3',
    ],
    window: 'before Friday 27 November evening',
  },
  {
    name: 'kyivska-perepichka',
    label: 'Kyivska Perepichka at The Wheeler Centre, Saturday 5 December',
    kind: 'coming_up',
    // The organiser's poster, whole, then our why go.
    files: ['kyivska-perepichka-poster-2026-12-05.jpg', 'kyivska-perepichka-why-go-2026-12-05.jpg'],
    eventIds: ['a6778756-b6f0-4997-8f1a-8d6c2aaa0bbe'],
    window: 'before Saturday 5 December',
  },
]

/** A set by its name, or null. Pure. */
export function approvedSetNamed(name: string): ApprovedSet | null {
  return APPROVED_SETS.find((s) => s.name === name) ?? null
}

/** A set's file at its own address on www. Pure. */
export function approvedSetFileUrl(file: string): string {
  const url = `${APPROVED_FILE_PREFIX}${file}`
  if (!isApprovedFileUrl(url)) throw new Error(`not an approved file's name: ${file}`)
  return url
}

/** The set a piece's slides are, exactly (its files in its order, nothing else), or null. Pure. */
export function approvedSetOfSlides(slides: readonly Slide[]): ApprovedSet | null {
  const urls = slides.map((s) => (s.t === 'file' ? s.url : null))
  return APPROVED_SETS.find((set) => set.files.length === urls.length && set.files.every((f, i) => urls[i] === `${APPROVED_FILE_PREFIX}${f}`)) ?? null
}
