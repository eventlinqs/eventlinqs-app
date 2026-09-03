/**
 * GUARD: THE STREAM LINK IS NEVER READ BY A PUBLIC SURFACE, AND THE INERT
 * COLUMN IS NEVER READ AT ALL.
 *
 * THE DEFECT THIS EXISTS TO STOP FROM COMING BACK, 3 September 2026. Scope v5
 * 3.11 says the livestream link "is only revealed to ticket holders after
 * purchase". For months the link was stored on events.virtual_url, a column on
 * a row the anon role can read, and was shown to nobody at all: the organiser
 * typed it in and no page ever read it back. Either failure is one careless
 * edit away from the other: a well-meaning "show the online link on the event
 * page" would have published every organiser's stream to the world.
 *
 * Migration 20260903000002 moved the value into event_stream_links, a table
 * with no anon grant, and left events.virtual_url permanently NULL (a trigger
 * moves anything written there and empties the column). Two things therefore
 * hold, and this guard holds them:
 *
 *   1. `virtual_url` is referenced nowhere under src except the generated
 *      types. It is always NULL, so a read is a bug and a write is a habit the
 *      trigger has to clean up after.
 *   2. `event_stream_links` and the modules that read it are reachable only
 *      from the organiser side (their own event, through RLS or an ownership
 *      check) and from the bearer-gated watch surface. The public event page,
 *      its components, the sitemap and the social cards never import them.
 *
 * WHAT IT CANNOT SEE, stated plainly: it reads source text. It cannot prove
 * that a gated reader checks the bearer pair correctly; that is what
 * tests/unit/stream/access.test.ts is for. It proves the link cannot reach a
 * public file at all, which is the property a test of one function cannot.
 *
 * Proven on 3 September 2026 by writing `{event.virtual_url}` into the public
 * event page (red, naming the file and line) and removing it (green). Both
 * outputs are in C:\dev\EVIDENCE\A2\guard-proof.txt.
 *
 * Run standalone:  node scripts/guards/stream-link-never-public.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')

/** The one file allowed to mention the inert column: the generated types. */
const INERT_COLUMN_ALLOWLIST = new Set(['src/types/database.ts'])

/** Files allowed to name the vault table. Organiser side and the gated reader. */
const VAULT_ALLOWLIST = new Set([
  'src/types/database.ts',
  'src/lib/stream/link.ts',
  'src/app/(dashboard)/dashboard/events/actions.ts',
  'src/app/(dashboard)/dashboard/events/[id]/edit/page.tsx',
])

/** Modules that hand back the link. Importing one from a public surface is the defect. */
const GATED_MODULES = ['@/lib/stream/link', '@/lib/stream/access', 'lib/stream/link', 'lib/stream/access']

/** Public surfaces: anything here renders for a stranger. */
const PUBLIC_PREFIXES = [
  'src/app/events/',
  'src/app/e/',
  'src/app/s/',
  'src/app/city/',
  'src/app/community/',
  'src/app/communities/',
  'src/app/categories/',
  'src/app/sitemap',
  'src/app/opengraph',
  'src/app/page.tsx',
  'src/app/api/events/',
  'src/components/features/events/',
  'src/components/checkout/',
  'src/lib/events/',
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full)
  }
  return out
}

const files = walk(SRC)
const failures = []
let inertMentions = 0
let vaultMentions = 0
let gatedImports = 0

for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/')
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`
    if (/\bvirtual_url\b/.test(line)) {
      inertMentions += 1
      // A type declaration or a null literal is not a read: a full Row literal
      // (the dev fixture) has to name every column, and naming this one as null
      // is exactly what the trigger would leave anyway.
      const inert = /virtual_url\??\s*:\s*(null\b|string \| null)/.test(line)
      if (!inert && !INERT_COLUMN_ALLOWLIST.has(rel)) {
        failures.push(`${at}  reads or writes the inert column events.virtual_url: ${line.trim().slice(0, 90)}`)
      }
    }
    if (/\bevent_stream_links\b/.test(line)) {
      vaultMentions += 1
      if (!VAULT_ALLOWLIST.has(rel)) {
        failures.push(`${at}  names the vault table outside the allowlist: ${line.trim().slice(0, 90)}`)
      }
    }
    if (/^\s*import\b/.test(line) && GATED_MODULES.some((m) => line.includes(`'${m}'`) || line.includes(`"${m}"`))) {
      gatedImports += 1
      if (PUBLIC_PREFIXES.some((p) => rel.startsWith(p))) {
        failures.push(`${at}  a public surface imports a module that returns the stream link: ${line.trim().slice(0, 90)}`)
      }
    }
  })
}

console.log(`stream-link-never-public: ${files.length} source files scanned under src`)
console.log(`  ${inertMentions} mention(s) of virtual_url, ${vaultMentions} of event_stream_links, ${gatedImports} import(s) of the gated modules`)

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} place(s) where the stream link could reach a stranger:`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nThe link is revealed only through /t/[code]/watch behind the bearer pair. Read it')
  console.error('through src/lib/stream/link.ts from an organiser-owned or bearer-gated surface, never here.')
  process.exit(1)
}

console.log('PASS: the stream link is unreachable from every public surface, and the inert column is read by nothing.')
