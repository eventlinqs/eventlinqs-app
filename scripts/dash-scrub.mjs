#!/usr/bin/env node
/**
 * dash-scrub.mjs
 *
 * One-shot codebase scrub that replaces em-dash (U+2014) and en-dash
 * (U+2013) characters in source, config, and EventLinqs-authored docs.
 *
 * Replacements:
 *   "X - Y"  ->  "X - Y"   (em-dash flanked by spaces becomes ASCII hyphen)
 *   "X - Y"    ->  "X - Y"   (em-dash without spaces becomes spaced ASCII hyphen)
 *   "X - Y"  ->  "X - Y"   (en-dash flanked by spaces becomes ASCII hyphen)
 *   "X-Y"    ->  "X-Y"     (en-dash without spaces becomes ASCII hyphen, no padding)
 *
 * Skips:
 *   - node_modules, .next, build, out, .git
 *   - docs/competitive-research/    (vendor-quoted research)
 *   - docs/BENCHMARKS/              (vendor-quoted research)
 *   - docs/strategy/                (likely contains pasted quotes)
 *   - docs/reports/                 (legacy reports may quote external)
 *   - docs/EVENTLINQS-HOMEPAGE-TARGET-V3.html (verbatim design output)
 *   - package-lock.json, *.lock     (managed lockfiles)
 *
 * Run from project root:
 *   node scripts/dash-scrub.mjs            (dry-run, prints diff summary)
 *   node scripts/dash-scrub.mjs --write    (apply changes)
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')

const INCLUDE_EXT = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx', '.md', '.sql', '.json', '.css', '.yml', '.yaml'])

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'build',
  'out',
  '.git',
  'coverage',
  '.vercel',
  '.lighthouse',
  '.claude',
  'docs/visual-regression',
])

const SKIP_PATH_PREFIXES = [
  'docs/competitive-research/',
  'docs/BENCHMARKS/',
  'docs/strategy/',
  'docs/reports/',
  'docs/EVENTLINQS-HOMEPAGE-TARGET-V3.html',
  '.lighthouse/',
  '.claude/',
  'docs/visual-regression/',
  // Applied migrations are history. Scrubbing seed-data dashes inside
  // applied SQL would diverge file vs. live database state. If a future
  // migration needs the scrub it should ship its own up-script.
  'supabase/migrations/',
]

const SKIP_FILES = new Set([
  'package-lock.json',
])

function shouldSkipPath(rel) {
  const norm = rel.split(sep).join('/')
  if (SKIP_FILES.has(norm)) return true
  for (const pref of SKIP_PATH_PREFIXES) {
    if (norm.startsWith(pref)) return true
  }
  return false
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

function scrub(text) {
  // Em-dash with surrounding spaces collapses to " - "
  let out = text.replace(/ \u2014 /g, ' - ')
  // Em-dash without surrounding spaces becomes spaced hyphen
  out = out.replace(/\u2014/g, ' - ')
  // En-dash with surrounding spaces collapses to " - "
  out = out.replace(/ \u2013 /g, ' - ')
  // En-dash without surrounding spaces becomes plain hyphen
  out = out.replace(/\u2013/g, '-')
  return out
}

let totalFiles = 0
let touchedFiles = 0
let totalReplacements = 0
const changedFiles = []

for (const path of walk(ROOT)) {
  const rel = relative(ROOT, path)
  if (shouldSkipPath(rel)) continue
  const dot = rel.lastIndexOf('.')
  if (dot === -1) continue
  const ext = rel.slice(dot)
  if (!INCLUDE_EXT.has(ext)) continue

  totalFiles++
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    continue
  }

  // Quick reject if no target characters present.
  if (!content.includes('\u2014') && !content.includes('\u2013')) continue

  const next = scrub(content)
  if (next === content) continue

  // Count replacements roughly.
  const hits = (content.match(/[\u2013\u2014]/g) || []).length
  totalReplacements += hits
  touchedFiles++
  changedFiles.push({ rel, hits })

  if (WRITE) {
    writeFileSync(path, next, 'utf8')
  }
}

console.log(`Scanned ${totalFiles} files`)
console.log(`${touchedFiles} files contain em-dash or en-dash characters`)
console.log(`${totalReplacements} total replacement candidates`)

if (changedFiles.length) {
  console.log('\nFiles with dashes:')
  for (const { rel, hits } of changedFiles) {
    console.log(`  ${hits.toString().padStart(4, ' ')}  ${rel}`)
  }
}

if (!WRITE) {
  console.log('\n(dry-run) re-run with --write to apply changes')
}
