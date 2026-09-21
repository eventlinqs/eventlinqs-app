/**
 * THE ADMIN DATA TABLE, WITH A PRESENTATION A PHONE CAN READ.
 *
 * ============================================================================
 * THE DEFECT THESE STRINGS EXIST TO CLOSE, MEASURED RATHER THAN ASSUMED
 * ============================================================================
 *
 * Driven on 21 September 2026 against a served production build, signed in as
 * a real super_admin, at 390, 768 and 1440
 * (scripts/verify/admin-tables-fit-drive.mjs, evidence in
 * C:\dev\EVIDENCE\C8\admin-tables): every admin table wrapped itself in
 * `overflow-x-auto` with an unqualified `min-w-[...]`, so on a phone it became
 * a horizontal scroller. Swiped to the right edge, which is the only way to
 * read the last column, THIRTEEN of them lost the row's own name off the left
 * of the screen: "Afrobeats Melbourne" at x -187, four numbers belonging to
 * nobody. And thirty-one controls inside those rows measured between 19 and 39
 * pixels on their smaller side, against the 44px minimum the constitution
 * states.
 *
 * The organiser dashboard's five tables were rebuilt hours earlier for the
 * identical fault. This is the same pattern carried onto the admin surfaces.
 *
 * ============================================================================
 * ONE DOM, CSS ONLY, AND WHY THAT IS NOT A PREFERENCE
 * ============================================================================
 *
 * Below `lg` the table parts stop being table parts: the `<table>` becomes a
 * block, the `<thead>` hides, and each `<tr>` becomes a bordered card whose
 * values carry their own headings inline. Above `lg` nothing changes and the
 * operations screen is the twelve-column table it should be at a desk.
 *
 * The alternative, rendering a second card DOM beside the table and hiding one
 * of them, ships both to every phone and doubles what C8 is trying to reduce.
 * It also gives every future contributor two places to add a column, which is
 * how a phone presentation silently stops matching the table it mirrors.
 * /admin/health WAS that second arrangement, and reading it is what settled
 * this: it carried a `<ul>` of cards for phones and a `<table>` from `sm` up,
 * and the two had already drifted apart on the Severity column, which the card
 * list simply did not show.
 *
 * `lg` and not `md`, and it is a measurement rather than a preference: the
 * admin sidebar is `hidden ... lg:block`, so `lg` is the exact width at which
 * these screens stop being a single column and become a desk layout.
 *
 * ============================================================================
 * SHAPE AND SKIN ARE SEPARATE, BECAUSE ONE ADMIN SURFACE IS LIGHT
 * ============================================================================
 *
 * Seventeen of the eighteen admin tables sit on `#0A0F1A` and their cards are
 * `#131A2A`. /admin/health is white-on-ink, because it is read beside the
 * status banner it belongs to. Rather than let that one screen hand-roll the
 * pattern (which is how a shared pattern acquires a second, drifting copy), the
 * geometry is exported once as a `_SHAPE` and each skin is composed from it.
 *
 * Composing is NOT concatenating at the call site: two competing `bg-*` or
 * `border-*` utilities on one element resolve by stylesheet order, which no
 * call site can see or control. The two skins are built here, where the
 * conflict is visible on one screen.
 *
 * ============================================================================
 * PLAIN STRINGS, NOT COMPONENTS
 * ============================================================================
 *
 * Every admin table is a server component that renders its own markup, and a
 * shared `<AdminTable>` wrapper would have to accept a column definition array
 * to be useful, which is a framework. A const string costs nothing at runtime,
 * composes with whatever a given cell already carries, and leaves each page's
 * markup readable as the table it is. It is the shape
 * src/components/features/dashboard/row-control.ts already established.
 *
 * NOTHING HERE INVENTS A TOKEN. Every colour, radius and size below is lifted
 * from the admin tables as they already stand (`bg-[#131A2A]`,
 * `border-white/[0.08]`, `border-white/[0.06]`, the `text-[11px] uppercase
 * tracking-[0.18em] text-white/50` of the column headings, which is what
 * ADMIN_CELL_LABEL is: the heading itself, moved inline next to its value).
 */

/* -------------------------------------------------------------------------- */
/* THE GEOMETRY. No colour, so it can wear either skin.                        */
/* -------------------------------------------------------------------------- */

/**
 * THE BOX AROUND THE TABLE.
 *
 * From `lg` up it is the card it always was. Below `lg` it gives up its own
 * border, background and corners, because each ROW is the card now and a card
 * inside a card is two borders saying the same thing.
 *
 * `lg:overflow-x-auto` and never a bare one: an unqualified scroller is the
 * instruction that produced the defect, and a guard fails the build on it.
 */
const WRAP_SHAPE =
  'rounded-xl max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto'

/**
 * ONE ROW, WHICH IS ONE CARD BELOW `lg`.
 *
 * `max-lg:mt-3` on the ROW rather than a gap on the body: a table body cannot
 * carry `space-y`, and several of these screens render a second `<tr>` that
 * belongs to the card above it.
 */
const ROW_SHAPE = 'max-lg:mt-3 max-lg:block max-lg:rounded-2xl max-lg:px-4 max-lg:py-3'

/* -------------------------------------------------------------------------- */
/* THE DARK SKIN. Seventeen of the eighteen.                                   */
/* -------------------------------------------------------------------------- */

export const ADMIN_TABLE_WRAP = `border border-white/[0.08] bg-[#131A2A] ${WRAP_SHAPE}`

export const ADMIN_ROW = `border-t border-white/[0.06] hover:bg-white/[0.03] max-lg:border max-lg:border-white/[0.08] max-lg:bg-[#131A2A] ${ROW_SHAPE}`

/** The column headings. They hide below `lg`, where every cell carries its own. */
export const ADMIN_THEAD =
  'bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50 max-lg:hidden'

/**
 * THE COLUMN HEADING, MOVED INLINE NEXT TO ITS VALUE, below `lg` only.
 *
 * This is the clause the whole rebuild exists for: a number with no heading and
 * no row name is a number belonging to nobody. The classes are the `<thead>`'s
 * own, so the heading reads the same whether it is above the column or beside
 * the value.
 */
export const ADMIN_CELL_LABEL =
  'mr-1 text-[11px] uppercase tracking-[0.18em] text-white/50 lg:hidden'

/** The empty state's cell. A designed answer, so it gets the card treatment too. */
export const ADMIN_EMPTY_CELL = 'px-4 py-10 text-center text-white/50 max-lg:block max-lg:px-0'

/* -------------------------------------------------------------------------- */
/* THE LIGHT SKIN. /admin/health only, and it says so.                         */
/* -------------------------------------------------------------------------- */

export const ADMIN_TABLE_WRAP_LIGHT = `border border-ink-200 bg-white ${WRAP_SHAPE}`

export const ADMIN_ROW_LIGHT = `border-b border-ink-100 last:border-0 max-lg:border max-lg:border-ink-200 max-lg:bg-white ${ROW_SHAPE}`

export const ADMIN_THEAD_LIGHT =
  'border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 max-lg:hidden'

export const ADMIN_CELL_LABEL_LIGHT =
  'mr-1 text-xs uppercase tracking-wide text-ink-400 lg:hidden'

/* -------------------------------------------------------------------------- */
/* SHARED BY BOTH SKINS. Geometry only, so there is nothing to diverge.        */
/* -------------------------------------------------------------------------- */

/**
 * THE TABLE. `max-lg:block` is what stops it being a table.
 *
 * Any minimum width a given screen needs is `lg:`-qualified at the call site;
 * an unqualified `min-w-[...]` forces the phone-width scroller straight back.
 */
export const ADMIN_TABLE = 'w-full text-left text-sm max-lg:block'

/** The body. A block below `lg` so its rows can be cards. */
export const ADMIN_TBODY = 'max-lg:block'

/**
 * THE CELL THAT SAYS WHOSE ROW THIS IS. Always the first one, always a block,
 * so it is the card's heading and can never be scrolled away from its values.
 */
export const ADMIN_CELL_NAME = 'px-4 py-3 max-lg:block max-lg:px-0 max-lg:py-0'

/**
 * EVERY OTHER VALUE CELL. `inline-block` below `lg` so several short values
 * flow onto one line of the card instead of each taking a line of its own.
 */
export const ADMIN_CELL =
  'px-4 py-3 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2'

/**
 * THE ACTIONS CELL, separated from the values by the rule the card draws for
 * it, so the buttons are not mistaken for another value.
 *
 * It carries the dark border and has no light twin, because the one light admin
 * table (/admin/health) has no control in any row: an exported constant nothing
 * renders is a constant that is never wrong and never checked.
 */
export const ADMIN_CELL_ACTIONS =
  'px-4 py-3 max-lg:mt-3 max-lg:block max-lg:border-t max-lg:border-white/[0.06] max-lg:px-0 max-lg:pb-0'

/**
 * A CONTROL INSIDE A ROW, RAISED TO THE 44px MINIMUM.
 *
 * Deliberately carries NO padding, text size or colour, so it composes with the
 * button classes each admin screen already has rather than fighting them.
 */
export const ADMIN_ROW_CONTROL = 'inline-flex min-h-11 items-center'

/** The empty state's row. */
export const ADMIN_EMPTY_ROW = 'max-lg:block'
