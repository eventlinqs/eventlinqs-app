import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import {
  LINKED_REF_FILE,
  TEST_PROJECT_REF,
  VERCEL_LINK_FILE,
  askLine,
  decide,
  outOfOrder,
  proofOneCanLook,
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

describe("a pending file older than production's newest (29 October: car 4 behind car 3)", () => {
  // The CLI's own rule, quoted from supabase/cli apps/cli-go/pkg/migration/apply.go (develop, read 29 October 2026):
  // a local file older than the newest remote version is refused with "Found local migration files to be inserted
  // before the last migration on remote database." unless db push is given --include-all ("Include all migrations
  // not found on remote history table.", supabase db push --help, 2.121.0).
  const applied = new Set(['20261028151001', '20261028201001', '20261028231001'])

  test('names every pending file whose version sorts before the newest applied, and only those', () => {
    const late = [
      { file: '20261028133001_listing_checks_reuse_basis.sql', version: '20261028133001' },
      { file: '20261028204001_supply_horizon_and_exceptions.sql', version: '20261028204001' },
    ]
    const after = [{ file: '20261029100001_later.sql', version: '20261029100001' }]
    expect(outOfOrder([...late, ...after], applied)).toEqual(late)
    expect(outOfOrder(after, applied)).toEqual([])
    expect(outOfOrder(late, new Set())).toEqual([])
    expect(outOfOrder([], applied)).toEqual([])
  })

  test('the push carries --include-all only when asked, after --linked, and still no credential', () => {
    expect(supabaseCommands()[1].args).toEqual(['supabase', 'db', 'push', '--linked'])
    expect(supabaseCommands(PRODUCTION_PROJECT_REF, { includeAll: false })[1].args).toEqual(['supabase', 'db', 'push', '--linked'])
    expect(supabaseCommands(PRODUCTION_PROJECT_REF, { includeAll: true })[1].args).toEqual(['supabase', 'db', 'push', '--linked', '--include-all'])
    expect(supabaseCommands(PRODUCTION_PROJECT_REF, { includeAll: true })[2].args).toEqual(['supabase', 'link', '--project-ref', TEST_PROJECT_REF])
  })

  test('the run decides --include-all from the pending set it listed, never always', () => {
    const source = readFileSync(join(process.cwd(), 'scripts', 'ops', 'apply-production-migrations.mjs'), 'utf8')
    expect(source).toContain('const late = outOfOrder(pending, listed.applied)')
    expect(source).toContain('supabaseCommands(PRODUCTION_PROJECT_REF, { includeAll: late.length > 0 })')
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

describe('proof 1 can look, judged before anything is linked or pushed', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  test('a tree with no .vercel/project.json cannot run proof 1; one with it can', () => {
    const root = mkdtempSync(join(tmpdir(), 'el-vercel-link-'))
    dirs.push(root)
    expect(proofOneCanLook(root)).toBe(false)
    mkdirSync(join(root, '.vercel'), { recursive: true })
    writeFileSync(join(root, VERCEL_LINK_FILE), '{"projectId":"prj_x","orgId":"team_x"}')
    expect(proofOneCanLook(root)).toBe(true)
  })

  test('the run refuses on a missing link before it links or pushes (23 October: the push landed, proof 1 could not look)', () => {
    const source = readFileSync(join(process.cwd(), 'scripts', 'ops', 'apply-production-migrations.mjs'), 'utf8')
    const refusal = source.indexOf('if (!proofOneCanLook())')
    expect(refusal).toBeGreaterThan(0)
    expect(refusal).toBeLessThan(source.indexOf('const [link, push] = supabaseCommands('))
    expect(refusal).toBeLessThan(source.indexOf('typed = askLine('))
    expect(source).not.toContain("'schema object the code names still absent'")
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

describe('askLine, the confirmation read', () => {
  const SCRIPT = join(process.cwd(), 'scripts', 'ops', 'apply-production-migrations.mjs')

  /** Run askLine in a child with the given stdin, and return what it read. */
  function askInChild(input: string): { typed: string | null; stdout: string; status: number | null } {
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { askLine } from ${JSON.stringify(pathToFileURL(SCRIPT).href)}; const t = askLine('prompt: '); process.stdout.write('<' + JSON.stringify(t) + '>')`,
      ],
      { input, encoding: 'utf8', timeout: 20000 },
    )
    const m = /<(".*")>$/s.exec(r.stdout)
    return { typed: m ? (JSON.parse(m[1]) as string) : null, stdout: r.stdout, status: r.status }
  }

  test('returns the first line without its terminator, whether the terminal ends it CRLF or LF, and reads nothing beyond it', () => {
    expect(askInChild('gndnldyfudbytbboxesk\r\n').typed).toBe('gndnldyfudbytbboxesk')
    expect(askInChild('gndnldyfudbytbboxesk\n').typed).toBe('gndnldyfudbytbboxesk')
    expect(askInChild('first\nsecond line never read\n').typed).toBe('first')
  })

  test('an empty or closed stdin reads as nothing typed, which decide() refuses', () => {
    const closed = askInChild('')
    expect(closed.typed).toBe('')
    expect(closed.status).toBe(0)
    expect(decide({ pending, typed: closed.typed }).action).toBe('refused')
  })

  test('the prompt is written before the read, so the founder sees what he is confirming', () => {
    expect(askInChild('x\n').stdout.startsWith('prompt: ')).toBe(true)
  })

  test('the confirmation is never read through readline, whose closed interface leaves a line read pending on the console that swallows the Enter meant for the CLI prompt that follows', () => {
    const source = readFileSync(SCRIPT, 'utf8')
    expect(source).not.toMatch(/from 'node:readline/)
    expect(source).not.toMatch(/createInterface\(/)
    expect(typeof askLine).toBe('function')
  })
})
