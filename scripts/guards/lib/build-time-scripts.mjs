/**
 * WHAT COUNTS AS A BUILD-TIME SCRIPT, AND WHAT IT READS THAT THE UPLOAD DROPS.
 *
 * One enumeration, shared by the two halves of the .vercelignore protection, so
 * they cannot come to disagree about the subject:
 *
 *   vercelignore-covers-guard-reads.mjs   judges the declared reads statically
 *   excluded-reads-survive-the-upload.mjs   RUNS every prebuild entry point whose
 *                                         code names an EXCLUDED path, inside a
 *                                         materialised Vercel upload
 *
 * IT FOLLOWS IMPORTS, and that is not decoration. The scan used to be a list of
 * DIRECTORIES (scripts/guards, scripts/guards/lib, src/lib/health) plus
 * scripts/check-*.mjs. scripts/verify/ was not among them, so
 * scripts/verify/launch-readiness.mjs was invisible to it while being imported by
 * a registered guard, and it is the file that holds
 * 'docs/verification/LAUNCH-READINESS.md' and 'docs/verification/launch-readiness'
 * as literals. A module a build-time guard imports IS build-time code, whatever
 * directory it happens to live in, and reasoning about directories rather than
 * about the import graph is how the fourth deployment was lost.
 *
 * Close-out F1.9.2.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * THE THINGS `prebuild` ACTUALLY INVOKES. A module is not here: it is reached
 * through the entry point that imports it, which is also how Vercel reaches it.
 */
export function runnableEntries(root) {
  const out = []
  const guards = join(root, 'scripts', 'guards')
  if (existsSync(guards)) {
    for (const name of readdirSync(guards)) if (name.endsWith('.mjs')) out.push(`scripts/guards/${name}`)
  }
  const scripts = join(root, 'scripts')
  if (existsSync(scripts)) {
    for (const name of readdirSync(scripts)) {
      if (name.startsWith('check-') && name.endsWith('.mjs')) out.push(`scripts/${name}`)
    }
  }
  if (existsSync(join(root, 'scripts/prebuild-fixture.mjs'))) out.push('scripts/prebuild-fixture.mjs')
  return out.sort()
}

/** Only RELATIVE imports are followed: a package is not this repository's code. */
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*['"](\.[^'"]+)['"]/g
const BARE_IMPORT = /(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g
const DYNAMIC_IMPORT = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g

/**
 * Every file reachable from `entries` by relative import, entries included.
 * @param {string} root
 * @param {string[]} entries repository-relative posix paths
 * @returns {string[]} sorted
 */
export function importClosure(root, entries) {
  const seen = new Set()
  const queue = []
  const add = (rel) => {
    const posix = rel.split('\\').join('/')
    if (seen.has(posix)) return
    if (!existsSync(join(root, posix))) return
    seen.add(posix)
    queue.push(posix)
  }
  for (const e of entries) add(e)
  while (queue.length > 0) {
    const file = queue.shift()
    const text = readFileSync(join(root, file), 'utf8')
    for (const re of [IMPORT, BARE_IMPORT, DYNAMIC_IMPORT]) {
      re.lastIndex = 0
      for (const m of text.matchAll(re)) {
        const target = resolve(join(root, dirname(file)), m[1])
        const rel = relative(root, target).split('\\').join('/')
        if (rel.startsWith('..')) continue // outside the repository; not ours to judge
        add(rel)
      }
    }
  }
  return [...seen].sort()
}

/**
 * Every build-time script: the prebuild entry points, everything they import,
 * plus the two library directories that are build-time by construction, so a
 * helper nobody imports yet is still scanned rather than invisible.
 */
export function buildTimeScripts(root) {
  const extra = []
  for (const dir of ['scripts/guards/lib', 'src/lib/health']) {
    const abs = join(root, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) if (name.endsWith('.mjs')) extra.push(`${dir}/${name}`)
  }
  return importClosure(root, [...runnableEntries(root), ...extra])
}

/**
 * A quoted string that looks like a repository path: at least one slash, no
 * spaces, no scheme. A path mentioned inside a sentence of prose does not match,
 * because the whole quoted string has to be the path.
 */
const PATH_LITERAL = /['"`]([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\/?)['"`]/g

/**
 * Every path literal named by a build-time script.
 * @param {string} root
 * @param {string[]} [files] defaults to buildTimeScripts(root)
 * @returns {Array<{ file: string, literal: string, line: number }>}
 */
export function pathLiterals(root, files = buildTimeScripts(root)) {
  const out = []
  for (const file of files) {
    const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/)
    lines.forEach((lineText, i) => {
      for (const m of lineText.matchAll(PATH_LITERAL)) {
        if (m[1].startsWith('http')) continue
        out.push({ file, literal: m[1], line: i + 1 })
      }
    })
  }
  return out
}

/**
 * The path literals a build-time script names that .vercelignore EXCLUDES, so
 * they do not arrive on the build host.
 *
 * NOT LIMITED TO docs/, and that generalisation is close-out F1.9.3's standing
 * rule made executable: "a build-time script may never read a file outside src/
 * unless .vercelignore re-includes it AND a drill has proved that script's
 * behaviour against a tree stripped exactly as .vercelignore strips it". Today
 * every excluded literal happens to sit under docs/, but design-captures,
 * research, audit-v2 and .git are excluded too, and the next one will not
 * announce itself.
 *
 * @param {string} root
 * @param {(path: string) => { ignored: boolean, by: string }} judgeIgnored
 * @param {string[]} [files]
 */
export function excludedLiterals(root, judgeIgnored, files = buildTimeScripts(root)) {
  return pathLiterals(root, files).filter(({ literal }) => {
    // A literal naming a DIRECTORY is judged by a path inside it, because the
    // ignore rules decide files: `!dir/` re-includes the directory while the
    // bare name still reads as excluded when judged as a file.
    const abs = join(root, literal.endsWith('/') ? literal.slice(0, -1) : literal)
    const isDir = existsSync(abs) && statSync(abs).isDirectory()
    return judgeIgnored(isDir ? `${literal.replace(/\/$/, '')}/probe` : literal).ignored
  })
}

/**
 * The top-level names .vercelignore has an EXCLUDING rule for. Derived from the
 * file rather than listed, so `research/` or `design-captures/` joining the set
 * needs no edit here.
 *
 * @param {{ negate: boolean, pattern: string }[]} rules
 */
export function excludedTopLevels(rules) {
  const out = new Set()
  for (const r of rules) {
    if (r.negate) continue
    const first = r.pattern.split('/')[0]
    if (first) out.add(first)
  }
  return out
}

/**
 * The prebuild entry points that must be RUN in a materialised upload: the ones
 * whose own code, or the code of anything they import, names a path that reaches
 * THROUGH .vercelignore, whether the ignore file currently drops it or lets it
 * back in.
 *
 * BOTH SIDES, deliberately. Judging only the CURRENTLY excluded literals would
 * stop running launch-readiness-honest.mjs the moment PART ONE re-included its
 * report, and that is the exact script whose behaviour on the build host cost
 * four deployments. A re-inclusion is a line in a file that anybody can delete;
 * the execution is the thing that notices.
 *
 * @param {string} root
 * @param {Set<string>} topLevels from excludedTopLevels()
 * @returns {Array<{ entry: string, because: string }>}
 */
export function entriesThatReadThroughTheIgnore(root, topLevels) {
  const out = []
  for (const entry of runnableEntries(root)) {
    const closure = importClosure(root, [entry])
    const hits = pathLiterals(root, closure).filter(({ literal }) => topLevels.has(literal.split('/')[0]))
    if (hits.length === 0) continue
    const files = [...new Set(hits.map((h) => h.file))]
    const via = files.length === 1 && files[0] === entry ? 'its own code' : `${files.join(', ')}`
    out.push({ entry, because: `${hits.length} literal(s) under an excluded top level, in ${via}` })
  }
  return out
}

/**
 * THE EXACT LINES .vercelignore NEEDS for one path, derived rather than described.
 *
 * gitignore never re-includes a file inside an excluded DIRECTORY, so each level
 * has to be walked down. Close-out F1.9.2: "fail when the file does not contain
 * them, printing the exact lines to add". A message that says "re-include it
 * level by level" makes the reader derive this by hand, and one of the four lost
 * deployments was exactly that derivation done wrong.
 *
 * @param {string} path a file, or a directory when it ends in '/'
 * @returns {string[]} the lines, in order, that must appear in .vercelignore
 */
export function reinclusionLines(path) {
  const isDir = path.endsWith('/')
  const clean = isDir ? path.slice(0, -1) : path
  const parts = clean.split('/')
  const lines = []
  // Every ancestor directory below the top-level exclusion is opened, then its
  // children are re-excluded, so nothing else inside it comes along.
  for (let depth = 2; depth < parts.length; depth++) {
    const ancestor = parts.slice(0, depth).join('/')
    lines.push(`!${ancestor}/`)
    lines.push(`${ancestor}/*`)
  }
  lines.push(isDir ? `!${clean}/` : `!${clean}`)
  return lines
}
