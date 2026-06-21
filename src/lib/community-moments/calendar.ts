/**
 * Community Moments calendar - source of truth for the H10 bento section
 * on the homepage and any future moment-driven discovery surface.
 *
 * Each entry carries:
 *   - `slug`: stable identifier for analytics + per-moment URLs
 *   - `name`: display name
 *   - `start` / `end`: ISO date strings (`YYYY-MM-DD`); for fixed-date
 *     moments, `end` equals `start`. For movable feasts (Eid, Lunar New
 *     Year, Diwali, Holi, Ramadan, Easter, Songkran), the dates carry
 *     the next-occurrence value and need refreshing annually.
 *   - `community`: optional heritage slug for the per-moment community CTA.
 *     v2: community moments are cross-dimensional. A moment links to a
 *     heritage slug when it maps to one; faith moments (Eid, Hanukkah),
 *     identity moments (Mardi Gras, Pride) and event-type moments
 *     (Comedy Festival) carry `null` (no heritage chip, by design).
 *   - `blurb`: one-line editorial copy
 *   - `imageQuery`: Pexels query keywords used by the photo helper
 *
 * Voice: Australian English, no em-dashes, no exclamation marks.
 *
 * Annual maintenance: refresh the dates each January for the coming year.
 */

export interface CommunityMoment {
  slug: string
  name: string
  /** ISO `YYYY-MM-DD`; inclusive. */
  start: string
  /** ISO `YYYY-MM-DD`; inclusive. Equal to `start` for single-day moments. */
  end: string
  /** v2 heritage slug, or null for faith / identity / event-type moments. */
  community: string | null
  blurb: string
  imageQuery: string
}

/**
 * Movable-date entries (refresh annually, source: Royal Greenwich Observatory
 * for Islamic moments, Indian govt almanac for Hindu, Chinese govt almanac
 * for Lunar). Dates below are the 2026 occurrences.
 */
export const CULTURAL_MOMENTS: CommunityMoment[] = [
  // First Nations - always surfaced first
  { slug: 'naidoc-week-2026',     name: 'NAIDOC Week',               start: '2026-07-05', end: '2026-07-12', community: 'aboriginal-torres-strait-islander', blurb: 'Celebrating the history, community and achievements of First Nations peoples.',    imageQuery: 'naidoc indigenous australian celebration smoking ceremony' },
  { slug: 'reconciliation-2026',  name: 'Reconciliation Week',       start: '2026-05-27', end: '2026-06-03', community: 'aboriginal-torres-strait-islander', blurb: 'A week of dialogue, learning, and shared history.',                              imageQuery: 'australian indigenous reconciliation celebration community' },
  { slug: 'invasion-day-2026',    name: 'Survival Day',              start: '2026-01-26', end: '2026-01-26', community: 'aboriginal-torres-strait-islander', blurb: 'First Nations music, ceremony, and community-led events.',                       imageQuery: 'australian indigenous survival day celebration ceremony' },

  // Faith - Islamic (no heritage chip; faith dimension)
  { slug: 'ramadan-2026',         name: 'Ramadan',                   start: '2026-02-17', end: '2026-03-19', community: null,                blurb: 'Iftar gatherings, late-night markets, mosque visits.',                            imageQuery: 'ramadan iftar lanterns crescent moon celebration' },
  { slug: 'eid-al-fitr-2026',     name: 'Eid al-Fitr',               start: '2026-03-20', end: '2026-03-22', community: null,                blurb: 'Three days of community feasts and family gatherings.',                          imageQuery: 'eid al fitr celebration family lights mosque' },
  { slug: 'eid-al-adha-2026',     name: 'Eid al-Adha',               start: '2026-05-26', end: '2026-05-29', community: null,                blurb: 'Festival of sacrifice, four days of community celebration.',                     imageQuery: 'eid al adha celebration mosque lights crescent' },

  // Indian
  { slug: 'holi-2026',            name: 'Holi',                      start: '2026-03-04', end: '2026-03-04', community: 'indian',            blurb: 'Festival of colours. Powder, music, every community welcome.',                     imageQuery: 'holi festival colours powder dance celebration india' },
  { slug: 'diwali-2026',          name: 'Diwali',                    start: '2026-11-08', end: '2026-11-12', community: 'indian',            blurb: 'Festival of lights. Five nights of lamps, sweets, fireworks.',                   imageQuery: 'diwali lamps lights celebration india festival' },

  // Chinese / Vietnamese / Korean / SE Asian
  { slug: 'lunar-new-year-2026',  name: 'Lunar New Year',            start: '2026-02-17', end: '2026-02-22', community: 'chinese',           blurb: 'Year of the Horse. Reunion dinners, lion dances, red lanterns.',                  imageQuery: 'lunar new year red lanterns dragon dance celebration' },
  { slug: 'mid-autumn-2026',      name: 'Mid-Autumn Festival',       start: '2026-09-25', end: '2026-09-25', community: 'chinese',           blurb: 'Mooncakes, lantern parades, family reunions under the harvest moon.',            imageQuery: 'mid autumn festival mooncake lanterns asian celebration' },
  { slug: 'lantern-festival-2026', name: 'Lantern Festival',         start: '2026-03-03', end: '2026-03-03', community: 'chinese',           blurb: 'Closing day of Lunar New Year, lanterns and tangyuan.',                          imageQuery: 'chinese lantern festival lights crowd celebration' },
  { slug: 'chuseok-2026',         name: 'Chuseok',                   start: '2026-09-25', end: '2026-09-27', community: 'korean',            blurb: 'Korean harvest festival, songpyeon and ancestral honour.',                       imageQuery: 'chuseok korean harvest festival traditional celebration' },
  { slug: 'tet-2026',             name: 'Tet',                       start: '2026-02-17', end: '2026-02-19', community: 'vietnamese',        blurb: 'Vietnamese Lunar New Year, peach blossoms and banh chung.',                      imageQuery: 'tet vietnamese new year flowers celebration' },
  { slug: 'songkran-2026',        name: 'Songkran',                  start: '2026-04-13', end: '2026-04-15', community: 'other-east-southeast-asian', blurb: 'Thai New Year, water blessings and street festivals.',                  imageQuery: 'songkran thailand water festival celebration street' },

  // Latin American
  { slug: 'dia-de-muertos-2026',  name: 'Dia de los Muertos',        start: '2026-11-01', end: '2026-11-02', community: 'latin-american',    blurb: 'Day of the Dead, ofrenda altars and pan de muerto.',                             imageQuery: 'dia de los muertos altar marigolds candles celebration mexico' },
  { slug: 'carnival-rio-2026',    name: 'Brazilian Carnival',        start: '2026-02-13', end: '2026-02-17', community: 'latin-american',    blurb: 'Five days of samba schools, blocos, and street parties.',                        imageQuery: 'brazilian carnival samba dancers parade rio celebration' },

  // African
  { slug: 'africa-day-2026',      name: 'Africa Day',                start: '2026-05-25', end: '2026-05-25', community: 'african',           blurb: 'Continental celebration, music and food across every African nation.',          imageQuery: 'africa day celebration drum dance flag continental' },

  // Caribbean
  { slug: 'caribbean-carnival-2026', name: 'Caribbean Carnival (AU)', start: '2026-09-12', end: '2026-09-12', community: 'caribbean',        blurb: 'Sydney and Melbourne carnival weekends with soca, steel drum, mas.',             imageQuery: 'caribbean carnival mas soca steel drum parade' },

  // Filipino
  { slug: 'sinulog-2026',         name: 'Sinulog',                   start: '2026-01-18', end: '2026-01-18', community: 'filipino',          blurb: 'Cebu festival of devotion, dance, and Santo Nino.',                              imageQuery: 'sinulog filipino cebu festival dance celebration' },
  { slug: 'flores-de-mayo-2026',  name: 'Flores de Mayo',            start: '2026-05-01', end: '2026-05-31', community: 'filipino',          blurb: 'May procession, flowers and Santacruzan parades.',                               imageQuery: 'flores de mayo filipino procession flowers celebration' },

  // Identity - Pride (no heritage chip; identity facet)
  { slug: 'mardi-gras-2026',      name: 'Sydney Mardi Gras',         start: '2026-02-21', end: '2026-03-01', community: null,                blurb: 'Two weeks, every community, parade Saturday March 1.',                             imageQuery: 'sydney mardi gras parade rainbow celebration pride' },
  { slug: 'pride-month-2026',     name: 'Pride Month',               start: '2026-06-01', end: '2026-06-30', community: null,                blurb: 'Thirty days of community events, fundraisers, and parties.',                     imageQuery: 'pride parade rainbow community celebration' },

  // European
  { slug: 'bastille-day-2026',    name: 'Bastille Day',              start: '2026-07-14', end: '2026-07-14', community: 'other-european',    blurb: 'French national day, picnics, fireworks, and bal populaire.',                    imageQuery: 'bastille day paris fireworks celebration france' },
  { slug: 'oktoberfest-2026',     name: 'Oktoberfest',               start: '2026-09-19', end: '2026-10-04', community: 'other-european',    blurb: 'Bavarian beer festival, Australian breweries throw their version.',              imageQuery: 'oktoberfest bavarian beer celebration tent' },
  { slug: 'greek-easter-2026',    name: 'Greek Orthodox Easter',     start: '2026-04-12', end: '2026-04-12', community: 'greek',             blurb: 'Midnight liturgy, lamb on the spit, and red eggs.',                              imageQuery: 'greek orthodox easter celebration church candles' },
  { slug: 'italian-festa-2026',   name: 'Italian Festa Season',      start: '2026-08-01', end: '2026-08-31', community: 'italian',           blurb: 'Lygon Street and Norton Street kick off summer feast nights.',                   imageQuery: 'italian festa celebration street food melbourne lygon' },

  // Event-type - Comedy (no heritage chip; event-type dimension)
  { slug: 'melbourne-comedy-2026', name: 'Melbourne Comedy Festival', start: '2026-03-25', end: '2026-04-19', community: null,               blurb: 'Four weeks of stand-up, sketch, and improv across the city.',                    imageQuery: 'comedy festival stand up microphone audience laughing' },

  // Pacific
  { slug: 'pacific-fest-2026',    name: 'Pasifika Festival Season',  start: '2026-03-07', end: '2026-03-31', community: 'pacific-pasifika',  blurb: 'Auckland and Sydney showcases of Pacific music, dance, and food.',               imageQuery: 'pacific islander polynesian dance celebration outdoor' },

  // Faith / holiday calendar (no heritage chip)
  { slug: 'hanukkah-2026',        name: 'Hanukkah',                  start: '2026-12-04', end: '2026-12-12', community: null,                blurb: 'Eight nights of light, latkes, and family menorah.',                             imageQuery: 'hanukkah menorah candles celebration jewish' },
  { slug: 'christmas-eve-2026',   name: 'Christmas Eve',             start: '2026-12-24', end: '2026-12-25', community: null,                blurb: 'Carols by candlelight, family feasts, midnight mass.',                           imageQuery: 'christmas eve carols candles celebration family' },
]
