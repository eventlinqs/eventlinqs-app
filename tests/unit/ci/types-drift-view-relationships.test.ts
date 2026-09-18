import { describe, it, expect } from 'vitest'
import { parseMigrationDdl, ddlExplainsDelta } from '../../../scripts/ci/types-drift-analyse.mjs'

/*
 * THE DRILL FOR THE 18 SEPTEMBER VIEW-RELATIONSHIP MISCLASSIFICATION.
 *
 * API1 adds three views over `events`, `orders` and `tickets`. `supabase gen
 * types` lists, for every foreign key, one entry per relation the target can be
 * reached through, so creating `api_v1_events` added a SECOND entry to the
 * Relationships of all 40 tables that carry an `event_id`. Not one of those
 * tables is named by the migration.
 *
 * The relationships rule required the migration to touch THAT table, so it could
 * explain none of them, and 49 correct differences reported as genuine drift on
 * a tree whose only pending migration plainly caused every one of them.
 *
 * EVERY TEST BELOW PAIRS THE POSITIVE WITH A NEGATIVE, for the reason the
 * neighbouring drill file states: a matcher that only ever says "explained" is
 * worse than the bug it replaces, because it turns the guard into something
 * that always passes. The negatives are the important half here, since this
 * change LOOSENS a check.
 */

const VIEW_MIGRATION = `
create or replace view public.api_v1_events as select e.id, e.organisation_id from public.events e;
create or replace view public.api_v1_orders as select o.id, o.organisation_id from public.orders o;
`
const ddl = parseMigrationDdl(VIEW_MIGRATION)

/** A Relationships leaf, in the shape the parser produces. */
const rel = (...entries: string[]) => ({ optional: false, type: entries.join(', ') + ',' })

const EVENT_FK =
  '{ foreignKeyName: "discount_codes_event_id_fkey" columns: ["event_id"] isOneToOne: false referencedRelation: "events" referencedColumns: ["id"] }'
const EVENT_FK_VIA_VIEW =
  '{ foreignKeyName: "discount_codes_event_id_fkey" columns: ["event_id"] isOneToOne: false referencedRelation: "api_v1_events" referencedColumns: ["id"] }'
const ORDER_FK_VIA_VIEW =
  '{ foreignKeyName: "discount_code_usages_order_id_fkey" columns: ["order_id"] isOneToOne: false referencedRelation: "api_v1_orders" referencedColumns: ["id"] }'
const ORG_FK =
  '{ foreignKeyName: "discount_codes_organisation_id_fkey" columns: ["organisation_id"] isOneToOne: false referencedRelation: "organisations" referencedColumns: ["id"] }'

const delta = (committed: unknown, live: unknown) => ({
  path: 'public.Tables.discount_codes.Relationships',
  kind: 'type-changed',
  committed,
  live,
})

describe('a new view explains the relationship entries it adds to OTHER tables', () => {
  it('explains one added entry naming a view the migration creates', () => {
    expect(
      ddlExplainsDelta(delta(rel(EVENT_FK_VIA_VIEW, EVENT_FK, ORG_FK), rel(EVENT_FK, ORG_FK)), ddl),
    ).toBe(true)
  })

  it('explains several added entries at once, across two views', () => {
    expect(
      ddlExplainsDelta(
        delta(rel(EVENT_FK_VIA_VIEW, EVENT_FK, ORDER_FK_VIA_VIEW, ORG_FK), rel(EVENT_FK, ORG_FK)),
        ddl,
      ),
    ).toBe(true)
  })

  it('still explains the old case: the migration names the table itself', () => {
    const own = parseMigrationDdl('alter table public.discount_codes add column note text;')
    expect(ddlExplainsDelta(delta(rel(EVENT_FK, ORG_FK), rel(EVENT_FK)), own)).toBe(true)
  })
})

describe('and explains nothing else, which is the half that matters', () => {
  it('refuses an added entry naming a relation the migration does not create', () => {
    const invented =
      '{ foreignKeyName: "discount_codes_venue_id_fkey" columns: ["venue_id"] isOneToOne: false referencedRelation: "venues" referencedColumns: ["id"] }'
    expect(ddlExplainsDelta(delta(rel(invented, EVENT_FK), rel(EVENT_FK)), ddl)).toBe(false)
  })

  it('refuses a genuine foreign key riding along beside an explained view entry', () => {
    const invented =
      '{ foreignKeyName: "discount_codes_venue_id_fkey" columns: ["venue_id"] isOneToOne: false referencedRelation: "venues" referencedColumns: ["id"] }'
    expect(
      ddlExplainsDelta(delta(rel(EVENT_FK_VIA_VIEW, invented, EVENT_FK), rel(EVENT_FK)), ddl),
    ).toBe(false)
  })

  it('refuses an entry that VANISHED from the committed side, because the migration drops nothing', () => {
    expect(ddlExplainsDelta(delta(rel(EVENT_FK), rel(EVENT_FK, ORG_FK)), ddl)).toBe(false)
  })

  it('refuses a changed column list on a relation the migration does NOT create', () => {
    /*
     * This is the shape a real foreign key change takes: the entry for the
     * existing relation moves. It names `events`, which the migration does not
     * create, so nothing explains it and the guard still fails.
     *
     * The mirror case is worth stating rather than asserting, because it would
     * be a false claim: an entry naming `api_v1_events` WITH different columns
     * is explained by the view, and that is correct. Such an entry cannot arise
     * on its own, because the generator derives the columns from the foreign
     * key, so a real change to that key moves the `events` entry too, and the
     * live-only side of that difference is then unexplained. The strictness
     * lives on both sides, not in one entry.
     */
    expect(
      ddlExplainsDelta(
        delta(rel(EVENT_FK.replace('["event_id"]', '["parent_event_id"]')), rel(EVENT_FK)),
        ddl,
      ),
    ).toBe(false)
  })

  it('refuses an identical pair, which is not a difference anything can explain', () => {
    expect(ddlExplainsDelta(delta(rel(EVENT_FK), rel(EVENT_FK)), ddl)).toBe(false)
  })

  it('refuses when the migration creates no view at all', () => {
    const unrelated = parseMigrationDdl('alter table public.events add column note text;')
    expect(
      ddlExplainsDelta(delta(rel(EVENT_FK_VIA_VIEW, EVENT_FK), rel(EVENT_FK)), unrelated),
    ).toBe(false)
  })
})
