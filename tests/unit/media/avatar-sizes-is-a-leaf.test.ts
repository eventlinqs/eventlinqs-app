import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AVATAR_SIZES } from '@/components/media/avatar-sizes'
import { MEDIA_SIZES } from '@/components/media/sizes'

/**
 * THE LEAF MUST STAY A LEAF, AND THE TWO TABLES MUST STAY ONE TABLE.
 *
 * WHAT THIS PROTECTS, measured rather than argued. `dashboard-topbar.tsx` is in
 * the dashboard SHELL, so it is in the first load of every dashboard route. It
 * renders `OrganiserAvatar`, which imported `./sizes`. `MEDIA_SIZES` is a single
 * object literal, so importing one member of it ships all of it, and the build
 * of 19 September 2026 put a 21,005 byte chunk carrying every `sizes` hint on
 * the platform (hero, bento, gallery, marketing, rail) into thirty dashboard
 * routes in order to render one 32px circle.
 *
 * It is also what the first-load ratchet caught: lane C proved across five
 * gate-environment builds that a growth in that table split the dashboard shell
 * chunk in two and cost every affected route bytes it had not asked for
 * (REVIEW-QUEUE-C.md, "BORDER FOR LANE B, URGENT FOR LANE A"). Making the
 * platform smaller was the close available; raising the mark was the other.
 *
 * THE DUPLICATION TEST IS THE ONE THAT MATTERS, and it exists because neither
 * declaration is allowed to reference the other. `sizes.ts` may not import this
 * module (`image-hints-match-the-cell` refuses any import there, by name) and
 * may not reference its values either (the width ladder in next.config.ts is
 * derived from `MEDIA_SIZES`'s string LITERALS, and
 * `candidate-ladder-has-no-dead-rung` caught the avatars vanishing from it the
 * moment they became references). This module may not import `sizes.ts`,
 * because importing it is the defect. So the five strings are declared twice by
 * necessity, and the only thing that can stop them drifting apart is a test
 * that reads both.
 */
describe('avatar-sizes', () => {
  it('imports_nothing_so_the_dashboard_shell_cannot_reach_the_media_table_through_it', () => {
    const src = readFileSync('src/components/media/avatar-sizes.ts', 'utf8')
    const imports = [...src.matchAll(/^\s*import\s[^\n]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(
      imports,
      'avatar-sizes.ts must import nothing. It is imported by OrganiserAvatar, which is ' +
        'rendered by the dashboard topbar, so any value import here lands in the first load ' +
        'of every dashboard route.',
    ).toEqual([])
  })

  it('the_avatar_component_no_longer_reaches_the_whole_sizes_table', () => {
    const src = readFileSync('src/components/media/OrganiserAvatar.tsx', 'utf8')
    const imports = [...src.matchAll(/^\s*import\s[^\n]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(
      imports,
      'OrganiserAvatar must not import ./sizes. Importing any member of MEDIA_SIZES ships ' +
        'the entire table, and this component is in the dashboard shell.',
    ).not.toContain('./sizes')
    expect(imports).toContain('./avatar-sizes')
  })

  it('the_two_declarations_of_the_avatar_slots_have_not_drifted_apart', () => {
    // The whole reason this file exists. Edit one side only and this goes red,
    // which is the only thing standing between the width ladder and a slot it
    // can no longer see.
    expect(MEDIA_SIZES.avatarXs).toBe(AVATAR_SIZES.xs)
    expect(MEDIA_SIZES.avatarTopbar).toBe(AVATAR_SIZES.topbar)
    expect(MEDIA_SIZES.avatarSm).toBe(AVATAR_SIZES.sm)
    expect(MEDIA_SIZES.avatarMd).toBe(AVATAR_SIZES.md)
    expect(MEDIA_SIZES.avatarLg).toBe(AVATAR_SIZES.lg)
  })

  it('sizes_ts_still_declares_the_avatar_slots_as_finished_string_literals', () => {
    // The width ladder in next.config.ts is derived by READING these literals.
    // A reference compiles, passes the test above, and silently removes the
    // avatars from the ladder; candidate-ladder-has-no-dead-rung then reports a
    // dead rung in next.config.ts, which points at the wrong file.
    const src = readFileSync('src/components/media/sizes.ts', 'utf8')
    for (const [key, value] of [
      ['avatarXs', '24px'],
      ['avatarTopbar', '32px'],
      ['avatarSm', '32px'],
      ['avatarMd', '48px'],
      ['avatarLg', '96px'],
    ] as const) {
      expect(
        src,
        `MEDIA_SIZES.${key} must stay a finished string literal: the configured width ` +
          'ladder is derived by reading this table as text, not by evaluating it.',
      ).toContain(`${key}: '${value}'`)
    }
  })

  it('the_move_changed_no_hint_any_avatar_slot_resolves_to', () => {
    // The five values as they stood before the move, written out rather than
    // derived, so this test can contradict the table rather than agree with it.
    expect(AVATAR_SIZES.xs).toBe('24px')
    expect(AVATAR_SIZES.topbar).toBe('32px')
    expect(AVATAR_SIZES.sm).toBe('32px')
    expect(AVATAR_SIZES.md).toBe('48px')
    expect(AVATAR_SIZES.lg).toBe('96px')
  })
})
