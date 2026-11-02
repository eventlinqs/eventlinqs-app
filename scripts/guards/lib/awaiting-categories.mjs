/**
 * THE CATEGORIES A NAMED MIGRATION ADDS, AWAITING ON A DATABASE THAT LACKS THEM (one rule, read by
 * community-layer-protected and discovery-indexability).
 *
 * A row of docs/scope/community-layer-approved.json may name the migration that adds it ("migration"). On a database
 * that migration has not reached (production waits for Lawal's own apply), ALL of that migration's categories are
 * absent together: that is AWAITING, reported and not failed. One present and another absent is a LOST category and is
 * never excused. A row naming no migration is never excused.
 *
 * Judged on the database alone, never on whether the migration file is in the tree: the city guide branch carries the
 * approved record but not 20261101161001, and its production build judges production (22 categories, none of the
 * three), so a file condition would have stopped that build in prebuild (WINDOW 1, 2 November 2026, before the car).
 *
 * @param {{ slug: string, migration?: string }[]} rows  the approved category rows
 * @param {readonly string[]} dbSlugs  the slugs the database holds
 * @returns {{ awaiting: Set<string>, lines: string[] }}
 */
export function awaitingCategories(rows, dbSlugs) {
  const have = new Set(dbSlugs)
  const byMigration = new Map()
  for (const row of rows) {
    if (!row || !row.migration) continue
    byMigration.set(row.migration, [...(byMigration.get(row.migration) ?? []), row.slug])
  }
  const awaiting = new Set()
  const lines = []
  for (const [migration, slugs] of byMigration) {
    if (slugs.every((s) => !have.has(s))) {
      for (const s of slugs) awaiting.add(s)
      lines.push(`awaiting ${migration} on this database: ${slugs.join(', ')} not yet present (all together, so nothing is lost)`)
    }
  }
  return { awaiting, lines }
}
