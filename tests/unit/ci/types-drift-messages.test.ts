import { describe, expect, test } from 'vitest'
import { cliCannotStartLines, firstLines, genTypesFailedLines } from '../../../scripts/ci/types-drift-messages.mjs'

/**
 * A CLI THAT CANNOT START IS NOT A LOGIN PROBLEM.
 *
 * 7 September 2026 (close-out C16.5): the types-drift guard answered a Supabase
 * CLI that never started with "could not reach the live DB ... run npx supabase
 * login". The two faults have different repairs, and the words for each are
 * pinned here.
 */
const cannotStart = Object.assign(new Error('Command failed: npx --yes supabase --version'), {
  stderr: 'No matching Supabase CLI binary package found for win32-x64\n',
})
const refused = Object.assign(new Error('Command failed: npx --yes supabase gen types'), {
  stderr: 'Unauthorized: access token not provided\n',
})

describe('types-drift messages', () => {
  test('a CLI that cannot start names the tool fault and the npx cache repair, never the login', () => {
    const text = cliCannotStartLines(cannotStart, { platform: 'win32', localAppData: 'C:\\Users\\x\\AppData\\Local' }).join('\n')
    expect(text).toContain('could not START')
    expect(text).toContain('C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx')
    expect(text).toContain('npx --yes supabase --version')
    expect(text).toContain('@supabase/cli-windows-x64')
    expect(text).toContain('No matching Supabase CLI binary package found for win32-x64')
    expect(text).not.toContain("Locally: run 'npx supabase login' once.")
  })

  test('the repair elsewhere names the home npx cache', () => {
    const text = cliCannotStartLines(cannotStart, { platform: 'linux' }).join('\n')
    expect(text).toContain('~/.npm/_npx')
    expect(text).not.toContain('Remove-Item')
  })

  test('a gen-types failure after the CLI started names the version and the login, not the cache', () => {
    const text = genTypesFailedLines(refused, '2.116.0').join('\n')
    expect(text).toContain('after the CLI started (version 2.116.0)')
    expect(text).toContain("Locally: run 'npx supabase login' once.")
    expect(text).toContain('SUPABASE_ACCESS_TOKEN')
    expect(text).toContain('Unauthorized: access token not provided')
    expect(text).not.toContain('could not START')
    expect(text).not.toContain('_npx')
  })

  test('what the child said is capped at twenty lines with blank lines dropped', () => {
    const noisy = { stderr: Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? '' : `line ${i}`)).join('\n') }
    const lines = firstLines(noisy)
    expect(lines).toHaveLength(20)
    expect(lines.every((l) => l.trim() !== '')).toBe(true)
    expect(firstLines({ message: 'only a message' })).toEqual(['only a message'])
  })
})
