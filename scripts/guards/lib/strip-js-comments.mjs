/**
 * SOURCE WITH ITS COMMENTS REMOVED, SO A CONTRACT CANNOT BE SATISFIED BY
 * PROSE.
 *
 * ============================================================================
 * THE DRILL THAT PRODUCED THIS
 * ============================================================================
 *
 * Close-out C8B.3, 19 September 2026. `class-lists-are-not-repeated-per-card`
 * clause A2 holds an exact contract: this file must name this composite. The
 * drill for `cv-section` deleted it from the one constant that applies it -
 *
 *     export const SECTION_RAIL = 'cv-section py-6 sm:py-8' as const
 *       // cv-section: skips layout until near the viewport (C8)
 *
 * - and the guard PASSED, because the COMMENT still said `cv-section`. Every
 * homepage rail would have stopped skipping below-the-fold layout and the
 * contract that exists to catch exactly that would have reported green.
 *
 * A comment is the most likely place for a composite's name to appear after
 * it has been removed from the code, because that is what a considerate
 * developer leaves behind when they take something out. So the contract reads
 * code only.
 *
 * ============================================================================
 * IT IS A TOKENISER, NOT A REGULAR EXPRESSION, AND THAT IS DELIBERATE
 * ============================================================================
 *
 * `s.replace(/\/\/.*$/gm, '')` deletes the second half of every string
 * containing `//`, and this repository is full of `'https://...'`. Removing a
 * URL from a file and then asking whether the file still mentions something
 * is how a guard starts failing on code that is fine. The state machine below
 * knows the four contexts a `/` can appear in - single quotes, double quotes,
 * template literals, and code - and only treats it as a comment in the last.
 *
 * WHAT IT DOES NOT HANDLE, stated rather than discovered later: a regular
 * expression literal containing a quote (`/['"]/`) confuses it, because
 * telling a regex literal from a division operator needs a real parser. It
 * replaces comments with SPACES rather than deleting them, so every line
 * number and column in the output still matches the input.
 */
export function stripJsComments(source) {
  const text = String(source)
  let out = ''
  let i = 0
  /** 'code' | 'line' | 'block' | "'" | '"' | '`' */
  let state = 'code'

  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line'
        out += '  '
        i += 2
        continue
      }
      if (ch === '/' && next === '*') {
        state = 'block'
        out += '  '
        i += 2
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        state = ch
        out += ch
        i += 1
        continue
      }
      out += ch
      i += 1
      continue
    }

    if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        out += ch
      } else {
        /* A space, so columns line up with the original. */
        out += ' '
      }
      i += 1
      continue
    }

    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code'
        out += '  '
        i += 2
        continue
      }
      out += ch === '\n' ? '\n' : ' '
      i += 1
      continue
    }

    /* Inside a string of some kind. A backslash escapes the next character,
     * which is what stops `'it\'s'` from ending the string early. */
    if (ch === '\\') {
      out += text.slice(i, i + 2)
      i += 2
      continue
    }
    if (ch === state) state = 'code'
    out += ch
    i += 1
  }
  return out
}
