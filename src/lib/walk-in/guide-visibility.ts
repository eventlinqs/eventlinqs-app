/**
 * WHO READS A WALK-IN GUIDE ON ITS PAGE (window 4, 24 October 2026; the project
 * manager's ruling of 13:24).
 *
 * The AMCF page proof found every UNLISTED walk-in page showing an empty
 * programme to everyone but its organiser: the page read the guide with the
 * public client, and the guide's only public policy admits public events
 * ("Walk-in guides of published public events are public", 20261021000020),
 * while the event row itself is readable unlisted ("Unlisted published events
 * are viewable", 20260101000001). The page now resolves the event under the
 * event's own policies first, and reads the guide with the service client only
 * when this rule says the public may see it: the same two cases the events
 * table admits, published and public, or published and unlisted.
 *
 * A draft, a cancelled, a postponed or a private event shows no guide to the
 * public, as before. Written as an ALLOW-LIST (src/lib/events/visibility.ts), so
 * a visibility a future migration adds shows nothing until it is named here.
 *
 * A leaf: no imports, so the rule is tested on its own.
 */

/** The visibilities whose published walk-in guide the public reads. */
export const GUIDE_PUBLIC_VISIBILITIES: readonly string[] = ['public', 'unlisted']

export function guideIsPublic(event: { status?: string | null; visibility?: string | null; entry_mode?: string | null }): boolean {
  return event.status === 'published' && event.entry_mode === 'walk_in' && GUIDE_PUBLIC_VISIBILITIES.includes(event.visibility ?? '')
}
