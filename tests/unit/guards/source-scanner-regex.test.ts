import { describe, expect, it } from 'vitest'
import { stripNonCode, stripComments } from '../../../scripts/guards/lib/source.mjs'

/**
 * THE SCANNER MUST UNDERSTAND REGEX LITERALS.
 *
 * WHY THIS EXISTS. `scripts/guards/lib/source.mjs` is the shared view seven
 * build-failing guards scan. It knew comments and quotes and nothing else, so a
 * REGEX containing a quote character opened a phantom string: the scanner read
 * the `"` inside `/^["']|["']$/` as the start of a string literal and consumed
 * forward hunting a closing quote that had nothing to do with it.
 *
 * It fails in the DANGEROUS direction, which is why it is pinned rather than
 * left to judgement. A desynchronised scanner BLANKS the code that follows it,
 * blanked code matches no pattern, and every guard built on the view then
 * reports the remainder of that file as clean. One regex could make a file
 * invisible to seven guards at once, including the one that stops a script
 * writing to the production database.
 *
 * The exact shape below, `.replace(/^["']|["']$/g, '')`, is the one that
 * exposed it: two quote characters inside a character class, followed by a real
 * string literal and a real call that a guard needs to see.
 */

const EXPOSING_SOURCE = [
  "const clean = raw.replace(/^[\"']|[\"']$/g, '')",
  "const marker = 'THIS_IS_STRING_CONTENT'",
  'await supabase.from("events").insert({ name: 1 })',
  '',
].join('\n')

describe('the shared guard scanner understands regex literals', () => {
  it('keeps code after a quote-bearing regex visible to the guards', () => {
    const code = stripNonCode(EXPOSING_SOURCE)

    // THE LOAD-BEARING ASSERTION. `.insert(` is what the production-write guard
    // looks for. If the scanner desynchronises on the regex above, this call is
    // blanked and the guard silently reports the file as not write-capable.
    expect(code).toContain('.insert(')
    expect(code).toContain('supabase.from(')
  })

  it('still blanks real string contents, which is the whole point of the view', () => {
    const code = stripNonCode(EXPOSING_SOURCE)
    expect(code).not.toContain('THIS_IS_STRING_CONTENT')
    expect(code).not.toContain('events')
  })

  it('blanks the regex body so its contents cannot be read as code', () => {
    const code = stripNonCode(EXPOSING_SOURCE)
    // The character class held a quote pair; neither may survive into the code
    // view, or a guard scanning for quotes would match the regex instead.
    expect(code).not.toContain('["')
  })

  it('preserves byte offsets, which every guard relies on for line numbers', () => {
    expect(stripNonCode(EXPOSING_SOURCE)).toHaveLength(EXPOSING_SOURCE.length)
    expect(stripComments(EXPOSING_SOURCE)).toHaveLength(EXPOSING_SOURCE.length)
    // Line count must survive too, because lineAt() counts newlines.
    expect(stripNonCode(EXPOSING_SOURCE).split('\n')).toHaveLength(
      EXPOSING_SOURCE.split('\n').length,
    )
  })

  it('does not mistake division for a regex', () => {
    // `)` and an identifier both read as VALUES, so the slash after them
    // divides. Getting this wrong would blank real arithmetic and, worse, run
    // the "regex" to end of line and blank the rest of the statement.
    const src = 'const half = (width + pad) / 2\nconst third = box.width / 3\nnext.insert(1)\n'
    const code = stripNonCode(src)
    expect(code).toContain('/ 2')
    expect(code).toContain('/ 3')
    expect(code).toContain('.insert(')
  })

  it('treats a slash after return as a regex, not a division', () => {
    const src = "function f(s) { return /^a['b]$/.test(s) }\nlater.insert(2)\n"
    const code = stripNonCode(src)
    expect(code).toContain('.insert(')
    expect(code).not.toContain("['b]")
  })
})
