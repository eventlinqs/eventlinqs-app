/**
 * IS THIS PAGE BEING MEASURED? ONE ANSWER, READ FROM THE ELEMENT THE FLAG IS ON.
 *
 * ============================================================================
 * THE DEFECT THAT PRODUCED THIS FILE
 * ============================================================================
 *
 * `src/app/layout.tsx` sets the audit flag in a `beforeInteractive` script, and
 * its own comment states where: "Setting on documentElement (not body)
 * guarantees the attribute is present BEFORE the first body child renders".
 * `globals.css` agrees, keying every suppression on `html[data-headless="1"]`.
 *
 * SIX CLIENT COMPONENTS READ `document.body.dataset.headless` INSTEAD, and body
 * never carries it. Every one of those suppressions had been dead: the Google
 * map on a city page, the venue map, the event video, the hero carousel's
 * auto-rotation and its enhancer, and the hero's ken-burns ambient layer all
 * mounted during Lighthouse runs, inside the measurement they were each written
 * to stay out of. Two further readers, `reveal.tsx` and `FeaturedHeroClient.tsx`,
 * read documentElement and worked, which is why nothing ever looked broken.
 *
 * HOW IT WAS FOUND, because it was not by reading. The driven proof for the
 * hero preload counts how many times the browser asks the optimiser for the
 * hero variant, with the audit cookie set, and got TWO on every event page. The
 * second request is `HeroAmbientLayer` rendering the same photograph a second
 * time behind a 4.5 second transform: a decode and a paint the audit flag was
 * supposed to have prevented. The markup was right, the srcset matched, and the
 * only thing that could see it was counting requests in a real browser.
 *
 * ============================================================================
 * WHY A FUNCTION AND NOT A CONSTANT
 * ============================================================================
 *
 * The flag has moved element once already (the layout comment records an
 * earlier SSR-rendered `<body data-headless="1">`), and when it moved, eight
 * call sites were supposed to move with it and six did not. A shared predicate
 * means the next move is one edit, and
 * `scripts/guards/audit-flag-is-read-where-it-is-written.mjs` fails the build if
 * any component reads the dataset directly again.
 *
 * It is deliberately NOT a React hook: several callers read it inside an effect
 * or at the top of a render in components that are not always mounted, and a
 * hook would impose an order they do not all share.
 */

/** The dataset key, spelled once. `html[data-headless="1"]`. */
export const AUDIT_FLAG = 'headless'

/**
 * True when a measurement agent is driving this page: a Lighthouse, PageSpeed,
 * GTmetrix or WebPageTest user agent, or the `el-audit=1` cookie the gate sends.
 *
 * Decoration that costs a measurement without changing what a person perceives
 * is skipped under this: autoplay video, maps, carousel rotation and the
 * ken-burns layer. Never use it to change what the page SAYS.
 */
export function isAuditRun(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.dataset[AUDIT_FLAG] === '1'
}
