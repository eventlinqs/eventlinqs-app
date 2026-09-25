/**
 * COUNTING THE PLACES AN ORDER IS CREATED, AND THE PLACES ITS ATTRIBUTION IS
 * CAPTURED.
 *
 * Extracted from the guard rather than written inside it for one reason: a
 * guard runs its work at import time, so a test that imports one runs it, and
 * on 15 September 2026 exactly that made a guard's own test file report as
 * collecting NO TESTS. The counting is the part with judgement in it, so it
 * lives here where it can be driven over text that is written to be difficult
 * without a database, a tree, or a process exit.
 */

/**
 * Statements that INSERT a row into `orders`.
 *
 * Matching the PAIR `.from('orders') ... .insert(` rather than either half is
 * what keeps a select or a delete on the same table out of the count. `src/`
 * carries eleven `from('orders')` occurrences; four of them are inserts, and
 * two of the others are `.delete()` calls in the very same functions.
 */
export function orderInsertCount(source) {
  const matches = source.match(/\.from\(\s*['"]orders['"]\s*\)\s*\.insert\s*\(/g)
  return matches ? matches.length : 0
}

/**
 * Calls to the write-time capture.
 *
 * The name must be followed by an opening parenthesis, so the `import { ... }`
 * line that brings it into a file is not mistaken for a use of it. A file that
 * imports the capture and never calls it is precisely the defect this counts.
 */
export function captureCallCount(source, name) {
  const matches = source.match(new RegExp(`\\b${name}\\s*\\(`, 'g'))
  return matches ? matches.length : 0
}
