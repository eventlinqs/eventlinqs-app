import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  LINKED_REF_FILE,
  TEST_PROJECT_REF,
  decide,
  readLinkedRef,
  supabaseCommands,
} from '../../../scripts/ops/apply-production-migrations.mjs'
import { PRODUCTION_PROJECT_REF } from '../../../scripts/ops/production-parity.mjs'

/**
 * THE FOUNDER'S MIGRATION STEP AS ONE COMMAND (Law 10, close-out C16). The
 * reserved act stays his; what is pinned here is every way the wrapper refuses
 * before it acts, that the push never carries a credential on its command
 * line, and that the CLI always rests on TEST afterwards.
 */
const pending = [
  { file: '20260905000003_venue_geocode_source_enum.sql', version: '20260905000003' },
  { file: '20260906000001_event_status_archived.sql', version: '20260906000001' },
]

describe('decide', () => {
  test('nothing pending is nothing to do, whatever was typed and whether or not it is a dry run', () => {
    expect(decide({ pending: [], typed: PRODUCTION_PROJECT_REF })).toEqual({ action: 'nothing-pending', pending: [] })
    expect(decide({ pending: [], dryRun: true })).toEqual({ action: 'nothing-pending', pending: [] })
  })

  test('a dry run with pending migrations lists them and stops', () => {
    expect(decide({ pending, dryRun: true, typed: PRODUCTION_PROJECT_REF })).toEqual({ action: 'dry-run', pending })
  })

  test('anything but the production ref is a refusal: empty, a yes, the TEST ref, or nothing typed at all', () => {
    for (const typed of ['', 'y', 'yes', TEST_PROJECT_REF, 'gndnldyfudbytbboxes', null, undefined]) {
      expect(decide({ pending, typed }).action, `typed ${JSON.stringify(typed)}`).toBe('refused')
    }
  })

  test('the production ref, exactly, applies; surrounding whitespace from the terminal is forgiven', () => {
    expect(decide({ pending, typed: PRODUCTION_PROJECT_REF })).toEqual({ action: 'apply', pending })
    expect(decide({ pending, typed: `  ${PRODUCTION_PROJECT_REF}\r\n` }).action).toBe('apply')
  })
})

describe('supabaseCommands', () => {
  test('links production first, pushes --linked and nothing else, and rests on TEST last', () => {
    const commands = supabaseCommands()
    expect(commands.map((c) => c.step)).toEqual(['link', 'push', 'rest'])
    expect(commands[0].args).toEqual(['supabase', 'link', '--project-ref', PRODUCTION_PROJECT_REF])
    expect(commands[1].args).toEqual(['supabase', 'db', 'push', '--linked'])
    expect(commands[2].args).toEqual(['supabase', 'link', '--project-ref', TEST_PROJECT_REF])
    expect(TEST_PROJECT_REF).not.toBe(PRODUCTION_PROJECT_REF)
  })

  test('no command carries a password, a connection string, or a project ref on the push', () => {
    const credentialFlags = new Set(['-p', '--password', '--db-url'])
    for (const command of supabaseCommands()) {
      for (const arg of command.args) expect(credentialFlags.has(arg), `${command.step} carries ${arg}`).toBe(false)
    }
    expect(supabaseCommands()[1].args).not.toContain('--project-ref')
  })
})

describe('readLinkedRef', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'el-linked-ref-'))
    dirs.push(dir)
    return dir
  }

  test('reads the ref the CLI wrote, trimmed; null when nothing is linked or the file is empty', () => {
    const root = scratch()
    expect(readLinkedRef(root)).toBeNull()
    mkdirSync(join(root, 'supabase', '.temp'), { recursive: true })
    writeFileSync(join(root, LINKED_REF_FILE), `${TEST_PROJECT_REF}\n`)
    expect(readLinkedRef(root)).toBe(TEST_PROJECT_REF)
    writeFileSync(join(root, LINKED_REF_FILE), '   \n')
    expect(readLinkedRef(root)).toBeNull()
  })
})

describe('the one command', () => {
  test('package.json exposes migrate:production through the Credential Manager helper, so the token is never pasted', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    const command = pkg.scripts['migrate:production']
    expect(command).toBeDefined()
    expect(command).toContain('scripts/ops/with-supabase-token.ps1')
    expect(command).toContain('scripts/ops/apply-production-migrations.mjs')
  })
})
