import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE BANNED WORD GUARD NAMES THE PROPER NOUN ROUTE (the guard audit of 14 November 2026,
 * C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md). Three of the week's stops were a comment naming a real organisation; each
 * author reworded it because the failure message offered only the retired-name exemption. The founder's ruling of
 * 3 September 2026 exempts a real name registered with its source, and the message now says where.
 */
const guard = readFileSync('scripts/guards/no-banned-word-anywhere.mjs', 'utf8').replace(/\r\n/g, '\n')
const failure = guard.slice(guard.indexOf('if (hits.length > 0 || pathHits.length > 0) {'))

describe('the banned word guard tells an author every lawful route', () => {
  it('names the proper noun registry and its source rule in the failure it prints', () => {
    expect(failure).toContain('scripts/guards/lib/proper-nouns.mjs')
    expect(failure).toContain('with the URL that confirms')
    expect(failure).toContain('Never reword a real name.')
  })

  it('still names the retired-name exemption, and still fails', () => {
    expect(failure).toContain('add an exemption with the reason.')
    expect(failure).toMatch(/process\.exit\(1\)/)
  })
})
