/**
 * THE TWO READERS BEHIND every-guard-has-been-seen-to-fail.
 *
 * Lane B, 18 September 2026. They live here rather than in the guard for the
 * reason every other detector in this directory does: a guard's top level RUNS,
 * and it calls process.exit on a fault. A unit test that imported the guard to
 * reach these functions would abort the whole vitest run the first time the
 * guard went red, which is precisely the moment the suite needs to keep going.
 *
 * Tests: tests/unit/guards/every-guard-has-been-seen-to-fail.test.ts
 */

/**
 * Every path run-guards.mjs runs, read out of its own source.
 *
 * DERIVED, NEVER LISTED, for the reason the drill harness learned twice: a
 * second copy of a list is a list that goes stale without anybody editing it.
 */
export function registeredEntryPoints(source) {
  const found = [...source.matchAll(/'(scripts\/[A-Za-z0-9/_-]+\.mjs)'/g)].map(m => m[1])
  return [...new Set(found)].sort()
}

/**
 * Every guard the drill harness actually aims at, parsed from the `guard:`
 * field of each drill.
 *
 * PARSED, NOT SEARCHED FOR. The first version asked whether the harness's text
 * CONTAINED the guard's file name, which is satisfied by a guard merely being
 * mentioned in a comment. The harness is full of prose about guards, and that
 * test read five as drilled that had never been aimed at once:
 * cron-routes-scheduled, no-ai-authorship, no-ambiguous-embed,
 * no-control-characters and no-inherited-git-env.
 *
 * AND ANCHORED TO THE START OF A LINE, which is not fussiness. The guard's own
 * second drill has to write a `guard:` field INSIDE a string, because the
 * regression it plants is a drill left aiming at a renamed guard. Without the
 * anchor that quoted field parsed as a real drill, the mutation looked like no
 * change at all, and the guard passed on a tree where the drill it was told to
 * notice had been broken. Found on the first run of that drill, which is the
 * entire argument for having one.
 */
export function drilledGuards(source) {
  const found = []
  for (const m of source.matchAll(
    /^\s*guard:\s*(?:`\$\{GUARDS\}\/([A-Za-z0-9._-]+\.mjs)`|'([^']+)')/gm,
  )) {
    found.push(m[1] ? `scripts/guards/${m[1]}` : m[2])
  }
  return [...new Set(found)].sort()
}
