/**
 * THE PLATFORM'S OWN PUBLIC PROFILES, in one place.
 *
 * WHY IT EXISTS. There were two hard-coded lists and they disagreed: the site
 * footer published five profiles, the contact page published three, and
 * `SiteSchemaJsonLd` published `sameAs: []` on every page of the platform. An
 * empty array is not silence, it is a claim that EventLinqs is the same entity
 * as nothing at all.
 *
 * SEO1 step 7 requires the `sameAs` set to be "read from configuration and never
 * typed into the page". This is that configuration, and the footer and the
 * contact page read it too, because a configuration with two copies still
 * standing beside it is a third copy rather than a source.
 *
 * ON `confirmed`, AND WHY IT IS NOT A CEREMONY. `sameAs` asserts to a search
 * engine that a URL is ANOTHER IDENTITY OF THIS ORGANISATION. Asserting it about
 * a profile that does not exist is worse than asserting nothing. The five URLs
 * below were probed on 14 September 2026 against a nonsense-handle control, and
 * only one of them can be proved from here:
 *
 *   linkedin.com/company/eventlinqs        200, and a nonsense company 404s.
 *                                          PROVEN to exist. Emitted.
 *   facebook.com/eventlinqs                200, but a nonsense page ALSO returns
 *                                          200. Proves nothing. UNSOURCED.
 *   instagram.com/eventlinqs               200, nonsense handle also 200.
 *                                          UNSOURCED.
 *   tiktok.com/@eventlinqs                 same shape as Instagram. UNSOURCED.
 *   twitter.com/eventlinqs                 301, destination not followed.
 *                                          UNSOURCED.
 *
 * The four UNSOURCED ones are still LINKED from the footer, because that is what
 * the platform already published to people and removing a link the founder put
 * there is not a build's decision. They are not ASSERTED to a machine until he
 * confirms them, which is one line in REVIEW-QUEUE-C.md rather than a guess made
 * here. Flip `confirmed` to true and `sameAs` picks them up, with no other edit.
 */

/** Every profile the platform publishes. The union is what makes lookup total. */
export type SocialLabel = 'Instagram' | 'TikTok' | 'X' | 'LinkedIn' | 'Facebook'

export interface SocialProfile {
  /** The label the footer and the contact page show, and the icon key. */
  label: SocialLabel
  /** The public profile URL. */
  href: string
  /**
   * True only when the profile has been shown to exist. Drives `sameAs`, never
   * the visible links: see the header for why those differ.
   */
  confirmed: boolean
  /**
   * True only for an account that is ours (the PM's 17:42 of 19 November 2026: 'any account that does not exist or is
   * not ours is removed'). A switch, never a deletion (law 13): a profile proved ours is shown again by setting it.
   */
  shown: boolean
}

/*
 * READ ON 19 NOVEMBER 2026 (train T): our posts publish to the Facebook Page behind profile id 61590528656810 (the
 * brand piece's own permalink, published 17:40:07), while facebook.com/eventlinqs answers 400; Lawal's own setup steps
 * name the Instagram account @eventlinqs; Blotato connects only those two (src/lib/health/checks.ts
 * checkSocialDestinations), and no record names a TikTok, X or LinkedIn account of ours. So those three are not shown
 * and not asserted until one is proved ours; the LinkedIn company page exists (14 September), but existing is not ours.
 */
export const SOCIAL_PROFILES: readonly SocialProfile[] = [
  { label: 'Instagram', href: 'https://www.instagram.com/eventlinqs',                      confirmed: true,  shown: true  },
  { label: 'TikTok',    href: 'https://tiktok.com/@eventlinqs',                            confirmed: false, shown: false },
  { label: 'X',         href: 'https://twitter.com/eventlinqs',                            confirmed: false, shown: false },
  { label: 'LinkedIn',  href: 'https://linkedin.com/company/eventlinqs',                   confirmed: false, shown: false },
  { label: 'Facebook',  href: 'https://www.facebook.com/profile.php?id=61590528656810',    confirmed: true,  shown: true  },
]

/** The profiles a page shows: ours only. */
export const SHOWN_PROFILES: readonly SocialProfile[] = SOCIAL_PROFILES.filter((p) => p.shown)

/** The labels shown, for a surface that picks some of them by hand (the contact page). */
export const SHOWN_LABELS: ReadonlySet<SocialLabel> = new Set(SHOWN_PROFILES.map((p) => p.label))

/**
 * Label to URL, for a surface that shows some of the profiles rather than all of
 * them (the contact page shows three). Total by construction: the keys are the
 * union above and tests/unit/seo/social-profiles.test.ts proves every one of
 * them resolves, so a profile renamed here cannot leave a page with an empty
 * href.
 */
export const SOCIAL_HREF = Object.fromEntries(
  SOCIAL_PROFILES.map(p => [p.label, p.href]),
) as Record<SocialLabel, string>

/**
 * The `sameAs` set for the Organization block: confirmed profiles only.
 *
 * Returns an empty array when nothing is confirmed, and the caller OMITS the
 * property rather than emitting `sameAs: []`, which is what shipped before.
 */
export function sameAsProfiles(): string[] {
  return SOCIAL_PROFILES.filter(p => p.confirmed && p.shown).map(p => p.href)
}
