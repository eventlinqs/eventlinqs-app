/**
 * The two ways the live half of the types-drift guard can fail before a single
 * type is compared, and what each one should say. Kept pure so a test can pin
 * the words.
 *
 * WHY (7 September 2026, close-out C16.5). The guard reported a Supabase CLI
 * that could not START ("No matching Supabase CLI binary package found for
 * win32-x64": an npx cache entry whose optional platform package npm had
 * skipped) as "could not reach the live DB ... run npx supabase login", which
 * sent the reader to the wrong place. A tool that cannot start and a service
 * that refused a request are different faults with different repairs, and the
 * guard now says which one it saw.
 */

/** The first lines of what a failed child said, blank lines dropped. */
export function firstLines(error, max = 20) {
  const text = String(error?.stderr || error?.message || '')
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, max)
}

/** `npx --yes supabase --version` failed: nothing about the live schema is known. */
export function cliCannotStartLines(error, { platform = process.platform, localAppData = process.env.LOCALAPPDATA } = {}) {
  const lines = [
    'FAIL: the Supabase CLI could not START through npx (`npx --yes supabase --version` failed), so nothing was generated and nothing is known about the live schema.',
    'This is a tool fault on this machine, not a drift and not a login problem; `supabase login` does not repair it.',
    'Seen on 7 September 2026: the npx cache entry for supabase held an EMPTY @supabase scope, because npm had skipped the optional platform package (@supabase/cli-windows-x64 on win32-x64) when its fetch failed, which an optional dependency does silently.',
  ]
  if (platform === 'win32') {
    const cache = `${localAppData || '%LOCALAPPDATA%'}\\npm-cache\\_npx`
    lines.push(`Repair: remove the npx cache and let it install again:  Remove-Item "${cache}" -Recurse -Force   then   npx --yes supabase --version   (expect a version number), then push again.`)
  } else {
    lines.push('Repair: remove the npx cache (rm -rf ~/.npm/_npx) and run `npx --yes supabase --version` (expect a version number), then push again.')
  }
  const detail = firstLines(error)
  if (detail.length > 0) lines.push('--- npx stderr ---', ...detail)
  return lines
}

/** The CLI started and `gen types` failed: Supabase refused the request or could not be reached. */
export function genTypesFailedLines(error, version) {
  return [
    `FAIL: 'supabase gen types' failed after the CLI started (version ${version}): Supabase refused the request or could not be reached.`,
    'In CI: ensure repository secret SUPABASE_ACCESS_TOKEN is set and still valid.',
    "Locally: run 'npx supabase login' once.",
    '--- gen-types stderr ---',
    ...firstLines(error),
  ]
}
