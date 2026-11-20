import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// SENTRY'S RELEASE IS THE BUILD'S OWN COMMIT (the PM's 15:41 item 2 of 20 November 2026: production's events read
// release=local, because the release lines read VERCEL_GIT_COMMIT_SHA at run time, where a function does not have it).
// next.config fixes the commit into the bundle at build time as SENTRY_RELEASE, and every Sentry.init reads it first.
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
const RELEASE_FILES = [
  ['sentry.edge.config.ts'],
  ['sentry.server.config.ts'],
  ['src', 'app', 'api', 'health', 'sentry-error', 'route.ts'],
  ['src', 'lib', 'observability', 'sentry-client-boot.ts'],
  ['src', 'lib', 'observability', 'sentry.ts'],
]

describe("Sentry's release is the commit, never 'local' on a deployment", () => {
  it('next.config fixes the build commit into the bundle as SENTRY_RELEASE', () => {
    expect(read('next.config.ts')).toMatch(/env: \{ SENTRY_RELEASE: process\.env\.VERCEL_GIT_COMMIT_SHA \|\| process\.env\.GITHUB_SHA \|\| '' \}/)
  })
  it.each(RELEASE_FILES.map((p) => [p.join('/'), p] as const))('%s reads SENTRY_RELEASE before anything else', (_name, parts) => {
    const src = read(...parts)
    expect(src).toMatch(/process\.env\.SENTRY_RELEASE \|\| process\.env\.VERCEL_GIT_COMMIT_SHA \|\| 'local'/)
    // No release line that skips SENTRY_RELEASE (the old one read the run time variable alone).
    expect(src).not.toMatch(/(?<!process\.env\.SENTRY_RELEASE \|\| )process\.env\.VERCEL_GIT_COMMIT_SHA \|\| 'local'/)
  })
})
