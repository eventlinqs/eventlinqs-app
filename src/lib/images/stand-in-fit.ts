/**
 * A STAND IN SHOWS ITS OWN EVENT (law 22: the photo fits its event; law 46 (f): the best licensed image that shows the
 * event; the PM's 07:40 item 3 of 22 November 2026). Read on www after train AZ: Sheffield Shield cricket shown as a
 * basketball court, a toddler storytime as an aquarium, a musical as a pottery wheel; 190 such assignments were retired
 * and replaced by photographs that show what each event's own words name. The rule, written once, judges a licensed
 * stand in against the words of the event it stands for (its title, then its summary):
 *   SPORT: the sport a sports event's words name must be the sport the photograph shows, and a sports event whose
 *          words name no sport fits no sport's photograph.
 *   NAMED PLACES AND ARTS: an aquarium, a zoo, a museum, a library, a market, lanterns, visual art or ballet shoes fit
 *          only an event whose words name one.
 * Pure.
 */

const SPORTS: readonly (readonly [string, RegExp])[] = [
  // Soccer before basketball, so 'Wellington Phoenix FC' is soccer, not the Phoenix of the NBL.
  ['soccer', /\b(soccer|fc|a-league|matildas|socceroos|victory|wanderers|glory|jets|football pitch)\b/i],
  ['basketball', /\b(basketball|nbl|united|phoenix|taipans|kings|bullets|jackjumpers|breakers|wildcats|hawks|36ers)\b/i],
  ['cricket', /\b(cricket|sheffield shield|bbl|stars|renegades|test match|boxing day test|t20i?|odi|ashes)\b/i],
  ['tennis', /\btennis\b/i],
  ['running', /\b(running|run|marathon|parkrun|athletics)\b/i],
  ['cycling', /\b(cycling|bike|ride)\b/i],
  ['swimming', /\bswim/i],
]

/** The sport some words name, the first rule that matches winning; null when they name none. */
export function sportNamed(words: string): string | null {
  for (const [sport, rx] of SPORTS) if (rx.test(words)) return sport
  return null
}

/** A photograph's subject that fits only an event whose words name the same thing, and those words. */
const NAMED: readonly (readonly [RegExp, RegExp])[] = [
  [/\baquarium\b/i, /\baquarium\b/i],
  [/\bzoo\b/i, /\bzoo\b/i],
  [/\bmuseum\b/i, /\b(museum|gallery)\b/i],
  [/\blibrary reading room\b/i, /\b(library|librarian|book|books|read|reading|story|stories|storytime)\b/i],
  [/\b(farmers market|produce)\b/i, /\b(market|farmers|produce)\b/i],
  [/\bcraft market\b/i, /\b(market|fair|makers|craft)\b/i],
  [/\blanterns?\b/i, /\b(festival|fair|lanterns?|lights?|night market|chanukah|hanukkah|diwali)\b/i],
  [/\b(art gallery|gallery exhibition|sculpture|pottery|paint palette|art studio)\b/i, /\b(art|arts|exhibition|gallery|pottery|ceramics?|painting|paint|sculpture|drawing|sketch|craft|printmaking|studio)\b/i],
  [/\bballet shoes\b/i, /\b(dance|ballet|dancing)\b/i],
]

/**
 * Whether a licensed stand in fits the event it stands for. `kind` is the event's own kind (an event_categories slug),
 * `words` its title and summary, `subject` what the photograph shows (its alt words, as looked at).
 */
export function standInFits(event: { readonly kind: string | null; readonly words: string }, subject: string): boolean {
  if (event.kind === 'sports') {
    const shown = sportNamed(subject)
    return shown !== null && shown === sportNamed(event.words)
  }
  for (const [photo, needs] of NAMED) if (photo.test(subject)) return needs.test(event.words)
  return true
}
