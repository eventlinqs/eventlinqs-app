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
 * as its tents carry Sao Paulo's signs. On the PM's 22:41 fixes WINDOW 5A looked at 44 more the same night, each a kind
 * of night with no sign, building or place a viewer could name (C:/dev/EVIDENCE/EL-15NOV/automation/standins-2/picks.json):
 * gigs, comedy, jazz, classical, talks and festivals, so a talk, a recital and a festival now carry one of their kind.
 * Then 31 more for the kinds out-12's bare slides held (C:/dev/EVIDENCE/EL-15NOV/automation/standins-3/picks.json): dance
 * on a stage, theatre, a candlelit Christmas crowd or a lit tree (never snow, never a named street), a produce stall and
 * a sports crowd in the stands (never a flag, a club's shirt, a sponsor's board or a ground a viewer could name).
 * Each then drawn through the product's own slide guard as a day band at three and four rows (screen 2, 16 November
 * 2026, C:/dev/EVIDENCE/EL-15NOV/automation/standins-3/screen-bands.json): the 19 whose gold date read under its
 * contrast there (the dance school's white stage floor among them, as out-12 showed) left the set.
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
  /**
   * False where the product's own guard read the venue's name under its contrast over this photograph's fade (screen 3,
   * 16 November 2026, after the PM's 00:45 put the eyebrow on the solid panel: 63 of 72 read clean;
   * C:/dev/EVIDENCE/EL-15NOV/automation/standins-3/screen-3.json). A venue slide never draws these.
   */
  venue?: false
  /** The Pexels page it was taken from. */
  page: string
}

export const STAND_INS: readonly StandIn[] = [
  { id: '1763067', kind: 'gig', subject: 'a gig crowd', photographer: 'Sebastian Ervi', venue: false, page: 'https://www.pexels.com/photo/silhouette-of-people-in-front-of-stage-1763067/' },
  { id: '1047442', kind: 'gig', subject: 'a gig crowd', photographer: 'anna-m. w.', page: 'https://www.pexels.com/photo/people-enjoying-the-concert-1047442/' },
  { id: '21790480', kind: 'gig', subject: 'a concert crowd', photographer: 'Benjamin Farren', venue: false, page: 'https://www.pexels.com/photo/silhouette-of-raised-arms-in-crowd-at-concert-21790480/' },
  { id: '1105666', kind: 'gig', subject: 'a gig crowd', photographer: 'Vishnu R Nair', page: 'https://www.pexels.com/photo/people-at-concert-1105666/' },
  { id: '23522931', kind: 'comedy', subject: 'a comedy stage', photographer: 'Gezer Amorim', page: 'https://www.pexels.com/photo/black-and-white-photograph-of-a-microphone-on-a-stage-and-spotlight-reflections-23522931/' },
  { id: '8186273', kind: 'comedy', subject: 'a comedy stage', photographer: 'Brett Sayles', venue: false, page: 'https://www.pexels.com/photo/microphone-on-stand-placed-on-stage-with-green-lights-8186273/' },
  { id: '9419374', kind: 'jazz', subject: 'a jazz club', photographer: 'cottonbro studio', page: 'https://www.pexels.com/photo/photo-of-a-woman-singing-near-musicians-9419374/' },
  // Widened on 15 November 2026 for out-12 (the PM's 22:41 fixes 1 and 2: every day slide carries a photograph of its lead
  // kind, and no photograph twice in the week's feed): 45 Pexels photographs, each looked at on its contact sheet before it
  // was chosen (C:/dev/EVIDENCE/EL-15NOV/automation/standins-2), Pexels License, credited on the slide.
  { id: '12265693', kind: 'gig', subject: 'a concert crowd', photographer: "Mark Wu", venue: false, page: 'https://www.pexels.com/photo/silhouetted-audience-and-artist-on-the-stage-at-the-concert-12265693/' },
  { id: '13230484', kind: 'gig', subject: 'a concert stage', photographer: "Lisa Fotios", page: 'https://www.pexels.com/photo/crowd-of-people-at-a-concert-13230484/' },
  { id: '15865135', kind: 'gig', subject: 'a concert crowd', photographer: "Danik Prihodko", page: 'https://www.pexels.com/photo/concert-at-night-15865135/' },
  { id: '16118368', kind: 'gig', subject: 'a band on stage', photographer: "Valentin Angel Fernandez", page: 'https://www.pexels.com/photo/band-singing-on-stage-at-rock-concert-16118368/' },
  { id: '19943363', kind: 'gig', subject: 'a gig crowd', photographer: "Barbara Bat\u00e1ri", page: 'https://www.pexels.com/photo/crowd-at-concert-19943363/' },
  { id: '2078071', kind: 'gig', subject: 'a concert crowd', photographer: "Aleksandar Pasaric", page: 'https://www.pexels.com/photo/people-raising-their-hands-2078071/' },
  { id: '2747446', kind: 'gig', subject: 'a concert crowd', photographer: "Wolfgang", page: 'https://www.pexels.com/photo/band-playing-on-stage-2747446/' },
  { id: '30215324', kind: 'gig', subject: 'a concert crowd', photographer: "Jeremy Li", page: 'https://www.pexels.com/photo/vibrant-indoor-concert-with-dynamic-lights-30215324/' },
  { id: '36257830', kind: 'gig', subject: 'a concert crowd', photographer: "alexandreeliasfotografia elias", venue: false, page: 'https://www.pexels.com/photo/vibrant-concert-scene-with-crowd-and-fire-effects-36257830/' },
  { id: '38485789', kind: 'gig', subject: 'a concert crowd', photographer: "Larysa Stratiichuk", page: 'https://www.pexels.com/photo/energetic-concert-crowd-with-blue-lighting-38485789/' },
  { id: '5193526', kind: 'gig', subject: 'a concert stage', photographer: "Maor Attias", page: 'https://www.pexels.com/photo/people-watching-live-concert-5193526/' },
  { id: '6270155', kind: 'gig', subject: 'a band on stage', photographer: "Artem Podrez", page: 'https://www.pexels.com/photo/band-performing-at-the-stage-6270155/' },
  { id: '6782332', kind: 'gig', subject: 'a concert crowd', photographer: "Bence Szemerey", page: 'https://www.pexels.com/photo/a-crowd-watching-concert-during-night-time-6782332/' },
  { id: '7715754', kind: 'gig', subject: 'a band on stage', photographer: "Alena Darmel", page: 'https://www.pexels.com/photo/rock-band-performing-on-stage-7715754/' },
  { id: '2101487', kind: 'comedy', subject: 'a comedy stage', photographer: "Katrien Grevendonck", page: 'https://www.pexels.com/photo/microphone-2101487/' },
  { id: '27390676', kind: 'comedy', subject: 'a comedian on stage', photographer: "Noe Barreto", page: 'https://www.pexels.com/photo/clima-con-el-publico-27390676/' },
  { id: '31129059', kind: 'comedy', subject: 'a comedian on stage', photographer: "Kerim Isazade", page: 'https://www.pexels.com/photo/back-view-of-speaker-on-stage-with-audience-lights-31129059/' },
  { id: '7807298', kind: 'comedy', subject: 'a comedy stage', photographer: "Aaron Johnson", page: 'https://www.pexels.com/photo/microphone-on-a-microphone-stand-7807298/' },
  { id: '9547593', kind: 'comedy', subject: 'a comedy stage', photographer: "Allie Reefer", page: 'https://www.pexels.com/photo/black-microphone-in-close-up-photography-9547593/' },
  { id: '9419224', kind: 'jazz', subject: 'a jazz club', photographer: "cottonbro studio", page: 'https://www.pexels.com/photo/music-band-performing-on-stage-9419224/' },
  { id: '26952977', kind: 'jazz', subject: 'a saxophonist on stage', photographer: "elusiyan eluwole", page: 'https://www.pexels.com/photo/royalty-26952977/' },
  { id: '5650950', kind: 'jazz', subject: 'a jazz band', photographer: "cottonbro studio", page: 'https://www.pexels.com/photo/man-playing-saxophone-5650950/' },
  { id: '9002800', kind: 'jazz', subject: 'a saxophonist on stage', photographer: "Yan Krukau", page: 'https://www.pexels.com/photo/a-man-in-white-long-sleeves-playing-saxophone-9002800/' },
  { id: '14364672', kind: 'jazz', subject: 'a jazz trumpet', photographer: "Caleb Oquendo", page: 'https://www.pexels.com/photo/photo-of-a-trumpeter-during-a-concert-14364672/' },
  { id: '12279497', kind: 'classical', subject: 'an orchestra\'s cellos', photographer: "Roxanne Minnish", page: 'https://www.pexels.com/photo/people-playing-cellos-12279497/' },
  { id: '35061321', kind: 'classical', subject: 'violinists in concert', photographer: "Bo\u017eo Gunjajevi\u0107", page: 'https://www.pexels.com/photo/violinists-performing-in-a-symphony-orchestra-35061321/' },
  { id: '7095043', kind: 'classical', subject: 'a string ensemble', photographer: "cottonbro studio", page: 'https://www.pexels.com/photo/women-playing-violin-near-window-7095043/' },
  { id: '7095053', kind: 'classical', subject: 'violinists in concert', photographer: "cottonbro studio", page: 'https://www.pexels.com/photo/a-woman-playing-violin-7095053/' },
  { id: '20733081', kind: 'talk', subject: 'an audience at a talk', photographer: "BBSO", page: 'https://www.pexels.com/photo/gathering-during-event-20733081/' },
  { id: '3321791', kind: 'talk', subject: 'an audience at a talk', photographer: "Matheus Bertelli", page: 'https://www.pexels.com/photo/photo-of-man-sitting-in-front-3321791/' },
  { id: '17842579', kind: 'festival', subject: 'a festival crowd', photographer: "Milo Deckert", venue: false, page: 'https://www.pexels.com/photo/people-having-fun-at-a-concert-17842579/' },
  { id: '2342409', kind: 'festival', subject: 'a festival crowd', photographer: "Wendy Wei", page: 'https://www.pexels.com/photo/woman-wearing-black-top-2342409/' },
  { id: '28407738', kind: 'festival', subject: 'a festival crowd', photographer: "Yury Gargay", venue: false, page: 'https://www.pexels.com/photo/silhouettes-at-outdoor-music-festival-in-nuremberg-28407738/' },
{ id: '12442275', kind: 'dance', subject: 'dancers on stage', photographer: "Ernest Ghazaryan", page: 'https://www.pexels.com/photo/women-dancing-on-the-stage-12442275/' },
  { id: '12442276', kind: 'dance', subject: 'dancers on stage', photographer: "Ernest Ghazaryan", page: 'https://www.pexels.com/photo/group-of-dancers-holding-hands-12442276/' },
  { id: '26726497', kind: 'dance', subject: 'dancers on stage', photographer: "Anya Ju\u00e1rez Tenorio", page: 'https://www.pexels.com/photo/group-dancing-on-stage-26726497/' },
  { id: '13610660', kind: 'dance', subject: 'two dancers on stage', photographer: "Ganesh Adyapady", page: 'https://www.pexels.com/photo/women-performing-a-traditional-dance-13610660/' },
  { id: '12327992', kind: 'dance', subject: 'dancers on stage', photographer: "\u0410\u043d\u0434\u0440\u0435\u0439", page: 'https://www.pexels.com/photo/photograph-of-boys-dancing-on-a-stage-12327992/' },
  { id: '20898292', kind: 'theatre', subject: 'actors on stage', photographer: "468684 Ink", page: 'https://www.pexels.com/photo/actors-on-theater-stage-20898292/' },
  { id: '4063091', kind: 'theatre', subject: 'actors in costume on stage', photographer: "Magno Coronel", page: 'https://www.pexels.com/photo/theater-actors-4063091/' },
  { id: '6899941', kind: 'theatre', subject: 'actors on stage', photographer: "cottonbro studio", page: 'https://www.pexels.com/photo/two-men-and-woman-wearing-different-costumes-6899941/' },
  { id: '6899790', kind: 'theatre', subject: 'actors on stage', photographer: "cottonbro studio", page: 'https://www.pexels.com/photo/portrait-of-a-romantic-man-and-woman-6899790/' },
  { id: '10601679', kind: 'theatre', subject: 'an actor on stage', photographer: "Matin Ziya", page: 'https://www.pexels.com/photo/woman-in-pain-10601679/' },
  { id: '5135100', kind: 'theatre', subject: 'a performer on stage', photographer: "Tima Miroshnichenko", page: 'https://www.pexels.com/photo/woman-in-velvet-dress-performing-on-stage-5135100/' },
  { id: '4061506', kind: 'theatre', subject: 'a theatre audience', photographer: "Erik Mclean", venue: false, page: 'https://www.pexels.com/photo/people-sitting-on-theater-chairs-4061506/' },
  { id: '11359523', kind: 'christmas', subject: 'carols by candlelight', photographer: "Nahmad Hassan", page: 'https://www.pexels.com/photo/a-group-of-people-holding-a-lighted-candles-11359523/' },
  { id: '36948772', kind: 'christmas', subject: 'a candlelit crowd', photographer: "Sun .X", page: 'https://www.pexels.com/photo/candlelight-vigil-unity-and-peaceful-gathering-36948772/' },
  { id: '35494477', kind: 'christmas', subject: 'carols by candlelight', photographer: "Caleb Oquendo", page: 'https://www.pexels.com/photo/candlelight-vigil-with-vibrant-stage-lights-35494477/' },
  { id: '7183556', kind: 'christmas', subject: 'a candlelit crowd', photographer: "Andrew PaKip", page: 'https://www.pexels.com/photo/crowd-of-people-with-candles-at-night-7183556/' },
  { id: '36332478', kind: 'christmas', subject: 'a lit Christmas tree', photographer: "Furkan Parakat", page: 'https://www.pexels.com/photo/festive-christmas-tree-illuminated-at-night-36332478/' },
  { id: '14075176', kind: 'christmas', subject: 'trees in Christmas lights', photographer: "\u5468\u8d5b \u738b", page: 'https://www.pexels.com/photo/bare-trees-with-christmas-lights-14075176/' },
  { id: '38949837', kind: 'market', subject: 'a fruit stall', photographer: "Martijn Stoof", page: 'https://www.pexels.com/photo/vibrant-fresh-fruit-display-at-outdoor-market-38949837/' },
  { id: '32465897', kind: 'market', subject: 'a produce stall', photographer: "Karen Longwell", page: 'https://www.pexels.com/photo/vibrant-farmers-market-in-toronto-with-fresh-produce-32465897/' },
  { id: '40317531', kind: 'sport', subject: 'a sports crowd', photographer: "Yizi Zeng", venue: false, page: 'https://www.pexels.com/photo/excited-crowd-at-outdoor-sporting-event-40317531/' },
  { id: '40317574', kind: 'sport', subject: 'a sports crowd', photographer: "Yizi Zeng", page: 'https://www.pexels.com/photo/crowd-in-stadium-watching-a-sporting-event-40317574/' },
  { id: '28457979', kind: 'sport', subject: 'a sports crowd', photographer: "hayati ilker erg\u00fcn", page: 'https://www.pexels.com/photo/vibrant-crowd-cheering-at-outdoor-stadium-event-28457979/' },
  { id: '12442272', kind: 'dance', subject: 'dancers on stage', photographer: "Ernest Ghazaryan", page: 'https://www.pexels.com/photo/women-in-sportswear-posing-on-black-stage-12442272/' },
  { id: '13466040', kind: 'dance', subject: 'a dancer on stage', photographer: "Nicolas Sosa", page: 'https://www.pexels.com/photo/elegant-ballerina-doing-a-performance-13466040/' },
  { id: '17029891', kind: 'dance', subject: 'a dancer on stage', photographer: "Rub\u00e9n Ostria Baltazar", page: 'https://www.pexels.com/photo/elegant-ballet-dancer-in-a-black-outfit-17029891/' },
  { id: '33865813', kind: 'dance', subject: 'two dancers on stage', photographer: "Matheus Andrade", page: 'https://www.pexels.com/photo/elegant-couple-performing-ballet-dance-33865813/' },
  { id: '35233104', kind: 'dance', subject: 'a dancer on stage', photographer: "MEHMET KAYNAR", page: 'https://www.pexels.com/photo/dynamic-ballet-dancer-amidst-colorful-smoke-35233104/' },
  { id: '6926736', kind: 'dance', subject: 'two dancers on stage', photographer: "Pavel Danilyuk", page: 'https://www.pexels.com/photo/a-man-and-woman-dancing-6926736/' },
  { id: '13632062', kind: 'dance', subject: 'a dancer on stage', photographer: "Miguel Rodriguez Le\u00f3n", page: 'https://www.pexels.com/photo/blurry-photo-of-a-woman-dancing-on-stage-13632062/' },
  { id: '27509166', kind: 'dance', subject: 'ballet dancers on stage', photographer: "Olivia", page: 'https://www.pexels.com/photo/four-ballerinas-in-black-and-white-are-dancing-27509166/' },
  { id: '32965247', kind: 'sport', subject: 'a sports crowd', photographer: "Luke Miller", page: 'https://www.pexels.com/photo/excited-sports-fans-cheering-at-game-32965247/' },
  { id: '15949231', kind: 'sport', subject: 'a sports crowd', photographer: "Mikkel Kvist", page: 'https://www.pexels.com/photo/people-cheering-during-the-match-15949231/' },
  { id: '14158918', kind: 'sport', subject: 'a sports crowd', photographer: "Lydia Murray", page: 'https://www.pexels.com/photo/people-in-a-stadium-14158918/' },
  { id: '34206834', kind: 'sport', subject: 'a sports crowd', photographer: "Erick Fr\u00edas cruceta", venue: false, page: 'https://www.pexels.com/photo/enthusiastic-crowd-cheering-at-indoor-event-34206834/' },
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
export function standInChooser(seed = ''): (kind: NightKind | null, use?: 'venue') => StandIn | null {
  const used = new Set<string>()
  // A piece's own starting place in each kind's photographs (out-10, 15 November 2026: one gig crowd led Melbourne's,
  // Geelong's and Bendigo's weeks alike): the seed (the piece's city and its own heading) turns the pool, so posts
  // differ; the same seed always draws the same photograph, so a re-render never changes a post.
  let turn = 0
  for (const ch of seed) turn = (turn * 31 + ch.charCodeAt(0)) % 9973
  // A photographer already drawn this week is passed over while another is free (out-12: two of one shoot's dancers stood
  // on Geelong's reel cover and its next slide, and read as the same stage twice).
  const shot = new Set<string>()
  return (kind, use) => {
    if (!kind) return null
    const base = STAND_INS.filter((s) => s.kind === kind && (use !== 'venue' || s.venue !== false))
    const pool = base.length ? [...base.slice(turn % base.length), ...base.slice(0, turn % base.length)] : base
    const pick = pool.find((s) => !used.has(s.id) && !shot.has(s.photographer)) ?? pool.find((s) => !used.has(s.id)) ?? null
    if (pick) {
      used.add(pick.id)
      shot.add(pick.photographer)
    }
    return pick
  }
}
