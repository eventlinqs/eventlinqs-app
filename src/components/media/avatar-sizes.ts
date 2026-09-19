/**
 * THE FIVE AVATAR SLOTS, AS A LEAF, BECAUSE THE TOPBAR IS IN EVERY DASHBOARD
 * ROUTE'S FIRST LOAD AND THE REST OF THE MEDIA TABLE IS NOT ITS BUSINESS.
 *
 * MEASURED, NOT REASONED. On the build of 19 September 2026, every dashboard
 * route carried a 21,005 byte first-load chunk whose identifying literals were
 * `(max-width: 768px) 75vw, 1920px` (MEDIA_SIZES.fullBleed) and `avatarTopbar`,
 * and nothing else in the dashboard shell reaches the media table: the ONLY
 * door is `dashboard-topbar.tsx` -> `OrganiserAvatar` -> `./sizes`. So thirty
 * routes were shipping every `sizes` hint on the platform, hero to gallery, to
 * render one 32px circle.
 *
 * `MEDIA_SIZES` is one object literal, so importing any member of it pulls all
 * of it. That is not a bundler fault and it is not fixable by a named import;
 * the fix is for the slot the shell actually needs to live somewhere the shell
 * can reach without the rest.
 *
 * THE FIVE STRINGS ARE DECLARED TWICE, HERE AND IN `sizes.ts`, AND BOTH
 * REFUSALS THAT FORCED THAT ARE WORTH RECORDING, because "just import it" is
 * the obvious first answer and it was tried first.
 *
 *   `sizes.ts` may not import this module. `image-hints-match-the-cell` refuses
 *   it by name: "it is the most widely reached module in the media layer, so
 *   whatever it imports reaches every route that renders any image. Keep the
 *   finished strings here."
 *
 *   `sizes.ts` may not reference this module's values either. The configured
 *   width ladder in next.config.ts is derived from the STRING LITERALS in
 *   `MEDIA_SIZES`, so writing `avatarXs: AVATAR_SIZES.xs` made the ladder lose
 *   the avatar slots entirely, and `candidate-ladder-has-no-dead-rung` caught
 *   it in the same build: "the width 32 is offered and nothing can select it".
 *
 * And this module may not import `sizes.ts`, because importing it is the whole
 * defect. So the two declarations cannot reference each other in either
 * direction, and the drift is closed by a TEST instead:
 * `tests/unit/media/avatar-sizes-is-a-leaf.test.ts` fails if one declaration
 * changes without the other.
 *
 * WHAT THIS IS NOT: a bare literal inside the component. The comment on
 * `avatarXs` in `sizes.ts` records what that cost last time. `MEDIA_SIZES` must
 * go on declaring every slot on the platform, because the width ladder is
 * derived from it, and a slot it cannot see is a rung nothing can select.
 *
 * A LEAF, AND IT MUST STAY ONE. No imports at all. `OrganiserAvatar` is a
 * client component, so every value import it makes is shipped to every person
 * who loads a dashboard page. `tests/unit/media/avatar-sizes-is-a-leaf.test.ts`
 * fails if an import ever appears here.
 */

/** The rendered pixel size of each avatar slot, and therefore its `sizes` hint. */
export const AVATAR_SIZES = {
  /** Extra small (24px). The smallest slot on the platform. */
  xs: '24px',
  /** Topbar (32px on every breakpoint). */
  topbar: '32px',
  /** Small (32px). */
  sm: '32px',
  /** Medium (48px). */
  md: '48px',
  /** Large (96px). */
  lg: '96px',
} as const

export type AvatarSizeKey = keyof typeof AVATAR_SIZES
