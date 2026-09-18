/**
 * READING <button> OUT OF JSX, AND THE ACCESSIBLE NAME A BROWSER WOULD COMPUTE.
 *
 * Close-out FO1, 18 September 2026. This lives in its own file, with its own
 * tests, for one reason: scripts/guards/drive-quantity-control-selector.mjs
 * exists to catch a button colliding with a Playwright selector, and a reader
 * that silently MISSES a button turns that guard into a green light. The first
 * draft of it did exactly that.
 *
 * THE BUG WORTH REMEMBERING. Finding the end of a JSX open tag with
 * `indexOf('>')` lands inside the `=>` of `onClick={() => setOpen(o => !o)}`.
 * Everything after it is read as body text, the accessible name comes out as a
 * slice of a className, and the button is invisible to the check. The button it
 * hid, in the run that found this, was "Add to calendar": the exact button that
 * had broken every money drive on the platform four days earlier.
 *
 * So the scan tracks quotes and brace depth rather than looking for a character.
 *
 * WHAT IT CANNOT DO, stated rather than hidden. A button whose label is entirely
 * a JSX expression (`{isPending ? 'Reserving…' : 'Checkout'}`) has no statically
 * readable name, and is returned with no name at all rather than with a guessed
 * one. Callers must treat "unnamed" as "unknown", never as "harmless".
 */

/**
 * Walk from just after `<button` to the `>` that closes the open tag, ignoring
 * any `>` inside a string or inside a `{ ... }` expression.
 * @returns the index of that `>`, or -1 if the tag never closes.
 */
export function endOfOpenTag(src, start) {
  let quote = null
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    const c = src[i]
    if (quote) {
      if (c === '\\') { i += 1; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '{') { depth += 1; continue }
    if (c === '}') { depth -= 1; continue }
    if (depth === 0 && c === '>') return i
  }
  return -1
}

/** Remove every balanced `{ ... }` expression, leaving the literal text. */
export function stripExpressions(text) {
  let out = ''
  let depth = 0
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (depth > 0) {
      if (quote) {
        if (c === '\\') { i += 1; continue }
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue }
      if (c === '{') depth += 1
      else if (c === '}') depth -= 1
      continue
    }
    if (c === '{') { depth = 1; continue }
    out += c
  }
  return out
}

/**
 * The accessible name a browser would compute, as far as a static read can go:
 * aria-label when it is a literal, otherwise the element's own text.
 * Returns null when the name is computed at runtime and cannot be known here.
 */
export function accessibleName(openTag, body) {
  const aria =
    openTag.match(/aria-label=\{`([^`]*)`\}/) ||
    openTag.match(/aria-label="([^"]*)"/) ||
    openTag.match(/aria-label=\{'([^']*)'\}/) ||
    openTag.match(/aria-label=\{"([^"]*)"\}/)
  if (aria) return aria[1].trim()
  if (/aria-label=/.test(openTag)) return null
  const text = stripExpressions(body)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text === '' ? null : text
}

/**
 * Every `<button>` in a source file, as `{ name, line, openTag }`.
 * Buttons with no statically readable name are omitted; a caller that needs to
 * know how many were skipped should count them itself.
 */
export function buttonsIn(src) {
  const found = []
  const OPEN = /<button\b/g
  let m
  while ((m = OPEN.exec(src))) {
    const end = endOfOpenTag(src, m.index + '<button'.length)
    if (end === -1) continue
    const openTag = src.slice(m.index, end + 1)
    let body = ''
    if (src[end - 1] !== '/') {
      let depth = 1
      let i = end + 1
      const startBody = i
      while (i < src.length && depth > 0) {
        if (src.startsWith('<button', i)) { depth += 1; i += 7; continue }
        if (src.startsWith('</button', i)) { depth -= 1; if (depth === 0) break; i += 8; continue }
        i += 1
      }
      body = src.slice(startBody, i)
    }
    const name = accessibleName(openTag, body)
    if (name) found.push({ name, line: src.slice(0, m.index).split('\n').length, openTag })
  }
  return found
}
