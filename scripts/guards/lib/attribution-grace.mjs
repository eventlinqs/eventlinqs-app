import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')

export const BACKSTOP_SOURCE = join('src', 'lib', 'attribution', 'backstop.ts')

/**
 * THE RESOLUTION GRACE, READ FROM THE ONE PLACE IT IS WRITTEN DOWN.
 *
 * The attribution invariant is defended by two things that must tolerate
 * EXACTLY the same window: the build guard that fails on an order with no
 * record, and the scheduled backstop that repairs one. The product owns the
 * number, because the window exists because of a scheduling decision in the
 * product (`afterResponse`), so the guard reads it out of the product rather
 * than carrying a copy.
 *
 * IT THROWS RATHER THAN DEFAULTING. A guard that falls back to a built-in
 * number when it cannot find the real one is a guard that silently stops
 * agreeing with the code it is checking, which is the whole defect this
 * removes. If the constant moves, every guard that reads it fails loudly and
 * names the file, which is a two-minute fix and a correct one.
 */
export function resolutionGraceMs() {
  const file = join(ROOT, BACKSTOP_SOURCE)
  if (!existsSync(file)) {
    throw new Error(
      `${BACKSTOP_SOURCE} does not exist, so the resolution grace window cannot be read. ` +
        'The attribution backstop is the one place that number is written down.',
    )
  }
  const source = readFileSync(file, 'utf8')
  /*
   * The value must START with a digit. An earlier form allowed the whole run to
   * be whitespace, so `= someFunction()` matched with an empty capture and the
   * reader reported "not a positive number" rather than "not a literal". Both
   * refuse, so nothing unsafe got through, but the wrong sentence sends the
   * next reader looking for a zero that is not there.
   */
  const match = source.match(/export const RESOLUTION_GRACE_MS\s*=\s*([0-9][0-9*\s]*)/)
  if (!match) {
    throw new Error(
      `${BACKSTOP_SOURCE} no longer exports RESOLUTION_GRACE_MS as a literal, so the guard and the ` +
        'backstop can no longer be proved to tolerate the same window.',
    )
  }
  const value = match[1]
    .split('*')
    .map(part => Number(part.trim()))
    .reduce((a, b) => a * b, 1)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${BACKSTOP_SOURCE} exports a RESOLUTION_GRACE_MS that is not a positive number: ${match[1]}`)
  }
  return value
}
