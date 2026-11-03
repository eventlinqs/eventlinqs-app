/**
 * ONE DOOR TO THE CLIPBOARD (the CONTROLLER's 14:10 of 3 November 2026; the every-tap drive on live: 'Copy link' and
 * 'Copy the link for Instagram' on an event page were DEAD TAPS where the async clipboard is refused). Every copy goes
 * through src/lib/share/copy-text.ts, which falls back to the browser's copy command; a raw clipboard write anywhere else
 * would bring the dead tap back. Its behaviour is tested in tests/component/copy-text.test.tsx (it needs a document).
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { gitEnv } from '../../../scripts/lib/git-env.mjs'

function rawWrites(): string[] {
  try {
    return execFileSync('git', ['grep', '-n', 'navigator.clipboard.writeText', '--', 'src'], { encoding: 'utf8', env: gitEnv() }).split('\n').filter(Boolean)
  } catch (error) {
    // git grep answers 1 when nothing matches: no write at all.
    if ((error as { status?: number }).status === 1) return []
    throw error
  }
}

describe('one door to the clipboard', () => {
  it('no file under src writes to the clipboard but copy-text.ts', () => {
    expect(rawWrites().filter((l) => !l.replace(/\\/g, '/').startsWith('src/lib/share/copy-text.ts:'))).toEqual([])
  })
  it('the door itself is found, so the search is looking in the right place', () => {
    expect(rawWrites().some((l) => l.replace(/\\/g, '/').startsWith('src/lib/share/copy-text.ts:'))).toBe(true)
  })
})
