/**
 * IS THIS NAME ACTUALLY USED HERE, RATHER THAN MERELY MENTIONED.
 *
 * WHY THIS IS SHARED RATHER THAN WRITTEN TWICE. The same blind spot appeared in
 * two guards on the same day, 19 September 2026, and both times a RED DRILL
 * found it rather than a reading:
 *
 *   discovery-consent-is-asked-once-and-never-preticked
 *     asked `includes('resolveCapturePlacement')`, so renaming the CALL left
 *     the import behind and the guard reported PASS over a page that no longer
 *     resolved the placement.
 *
 *   the-group-rate-and-the-sharer-are-honest
 *     asked `includes('EventShareBar')`, so taking the share bar out of the JSX
 *     left `import { EventShareBar }` behind and the guard reported PASS over a
 *     ticket page with no share bar on it.
 *
 * An import line carries a name as happily as a use does, and so does a
 * declaration. A guard that cannot tell them apart passes over the exact
 * regression it was written to catch. Written once here so the third guard
 * cannot get it wrong again.
 */

/** Source with import statements removed, single line and multi line. */
export function withoutImports(source) {
  const kept = []
  let insideImport = false
  for (const line of source.split('\n')) {
    if (insideImport) {
      if (/from\s+['"]/.test(line)) insideImport = false
      continue
    }
    if (/^\s*import\b/.test(line)) {
      if (!/from\s+['"]/.test(line)) insideImport = true
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

/**
 * True when `name` is CALLED somewhere that is neither its import nor its own
 * declaration. A helper must be both named and called.
 */
export function callsFunction(source, name) {
  const body = withoutImports(source)
    .split('\n')
    .filter(line => !new RegExp(`(function|const|let|var)\\s+${name}\\b`).test(line))
    .join('\n')
  return new RegExp(`\\b${name}\\s*\\(`).test(body)
}

/**
 * True when `name` is RENDERED as a JSX element somewhere that is not its
 * import. `<Name `, `<Name/` and `<Name>` all count; a mention in a comment
 * does not, because a comment does not open an element.
 */
export function rendersComponent(source, name) {
  return new RegExp(`<${name}(\\s|/|>)`).test(withoutImports(source))
}
