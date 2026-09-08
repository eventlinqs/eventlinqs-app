/**
 * ONE OPEN PULL REQUEST AT A TIME (close-out PR HYGIENE, PR5, 8 September 2026).
 *
 * THE RULE, VERBATIM: "From now on, one open pull request at a time. Open the
 * next only when the previous is merged or closed. Register a guard or a check
 * that reports when more than two pull requests are open at once."
 *
 * WHY IT EXISTS. On 8 September 2026 there were twenty two open pull requests,
 * most of them months old. That is not a backlog, it is a graveyard: it hides
 * what is actually in flight, and the PR1 audit found eighteen of the twenty two
 * were already on main or superseded by later work. Every one of those had to be
 * adjudicated by hand, file by file, because a title tells you nothing. The cost
 * of letting the list grow is paid later, by somebody reading thirty diffs to
 * find out which two mattered.
 *
 * WHY IT IS NOT A BARE COUNT, which is the interesting part. The same audit left
 * THREE pull requests open BY DECISION, each carrying files that exist on main
 * nowhere and are still wanted (close-out PR2: never close a pull request
 * carrying work that is not on main). A guard that simply failed at "more than
 * two open" would have failed the build on the day it was written, for three
 * pull requests the owner had been told in writing would stay open. A gate that
 * cannot go green is a gate somebody switches off, which CLAIMS to be protection
 * for as long as it takes anyone to notice it is disabled. CLAUDE.md already
 * names that decay twice, for no-ai-authorship and for branch-protection-required.
 *
 * So the count that matters is ACTIVE = open minus parked, and parking is a
 * REVIEWED RECORD rather than a number in a variable:
 * scripts/guards/lib/parked-pull-requests.json, one entry per held pull request
 * carrying why it is held and what ends the holding. The record is printed on
 * every run and is itself checked for rot, the same shape as the reviewed
 * baseline in sourced-specifications.mjs, so an allowlist cannot quietly stop
 * being read. Three ways it can rot are faults:
 *
 *   1. an entry naming a pull request that is no longer open, which means the
 *      record outlived its subject;
 *   2. an entry whose branch no longer matches the open pull request's head,
 *      which means the entry is about something else now;
 *   3. an entry with no why or no unblockedBy, because parking with no stated
 *      end is abandonment with better manners.
 *
 * THE THRESHOLD IS STRICTER THAN THE CLAUSE ASKS FOR, deliberately. PR5's
 * sentence says "reports when more than two are open"; PR5's actual rule is one
 * at a time. This fails at more than ONE active, and prints the TOTAL open count
 * on every run, so "more than two open" is visible whether or not it fails.
 *
 * WHERE THIS IS A REAL GATE, stated plainly rather than implied. It needs to ask
 * GitHub, so it reads with the gh CLI's stored login locally or GITHUB_TOKEN when
 * one is present, and SKIPS in capitals with the remedy otherwise. The CI verify
 * job carries no GITHUB_TOKEN, and deliberately: the same variable would reach
 * branch-protection-required.mjs, whose reads need admin rights the default
 * Actions token does not have, and a 403 there would fail builds for a
 * permission, not a fault. That is not a loss here, because this rule is about
 * the moment a pull request is about to be OPENED, and that moment is on the
 * machine running the pre-push gate, where gh is logged in. On the Vercel build
 * host neither credential exists and the guard SKIPs, so it can never block a
 * deploy for want of a token.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { gitEnv } from '../lib/git-env.mjs'

const TAG = '[one-pull-request-at-a-time]'
const HERE = dirname(fileURLToPath(import.meta.url))
const RECORD_PATH = join(HERE, 'lib', 'parked-pull-requests.json')

/** The rule: more than this many unexplained open pull requests fails the build. */
export const MAX_ACTIVE = 1

/** GitHub's maximum page size. Declared as TRUNCATED below if the listing fills it. */
const PAGE_SIZE = 100

export function repositoryFromEnvOrGit() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', env: gitEnv() }).trim()
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/)
    if (m) return `${m[1]}/${m[2]}`
  } catch (error) {
    console.warn(`${TAG} no origin remote could be read (${error.message})`)
  }
  return null
}

/**
 * Pure judgement over the two lists, so every shape can be driven in a unit test
 * without the network, the way judgeProtection is.
 *
 * @typedef {{ number: number, branch: string, title?: string, draft?: boolean }} OpenPullRequest
 * @typedef {{ number: number, branch: string, why: string, unblockedBy: string }} ParkedEntry
 *
 * @param {object} input
 * @param {OpenPullRequest[]} input.open     the open pull requests
 * @param {ParkedEntry[]} input.parked       the reviewed record
 * @returns {{ faults: string[], active: OpenPullRequest[], parkedOpen: OpenPullRequest[] }}
 */
export function judgeOpenPullRequests({ open, parked }) {
  const faults = []
  const openByNumber = new Map((open ?? []).map((p) => [p.number, p]))
  const parkedNumbers = new Set((parked ?? []).map((p) => p.number))

  for (const entry of parked ?? []) {
    const live = openByNumber.get(entry.number)
    if (!live) {
      faults.push(
        `the parked record names #${entry.number} (${entry.branch}) and that pull request is not open any more. ` +
          'Delete the entry: a record that outlives its subject is how an allowlist stops being read.',
      )
      continue
    }
    if (live.branch !== entry.branch) {
      faults.push(
        `the parked record for #${entry.number} names branch "${entry.branch}" and the open pull request is on "${live.branch}". ` +
          'Re-read the pull request and rewrite the entry, or delete it: it is about something else now.',
      )
    }
    if (!String(entry.why ?? '').trim()) {
      faults.push(`the parked record for #${entry.number} has no "why". Parking with no stated reason is abandonment with better manners.`)
    }
    if (!String(entry.unblockedBy ?? '').trim()) {
      faults.push(`the parked record for #${entry.number} has no "unblockedBy". Parking must say what ends the parking, or it never ends.`)
    }
  }

  const active = (open ?? []).filter((p) => !parkedNumbers.has(p.number))
  if (active.length > MAX_ACTIVE) {
    faults.push(
      `${active.length} pull requests are open and unaccounted for, and the rule is ${MAX_ACTIVE} at a time (close-out PR5): ` +
        active.map((p) => `#${p.number} (${p.branch})`).join(', '),
    )
  }

  return { faults, active, parkedOpen: (open ?? []).filter((p) => parkedNumbers.has(p.number)) }
}

function readOpenWithGh(repo) {
  const out = execFileSync('gh', ['api', `repos/${repo}/pulls?state=open&per_page=${PAGE_SIZE}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: gitEnv(),
  })
  return JSON.parse(out)
}

async function readOpenWithToken(repo, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=${PAGE_SIZE}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GET /repos/${repo}/pulls answered HTTP ${res.status}`)
  return res.json()
}

/** @returns {Promise<{number:number, branch:string, title:string, draft:boolean}[]>} */
export async function readOpenPullRequests(repo) {
  const token = process.env.GITHUB_TOKEN
  const raw = token ? await readOpenWithToken(repo, token) : readOpenWithGh(repo)
  return raw.map((p) => ({ number: p.number, branch: p.head?.ref ?? '', title: p.title ?? '', draft: Boolean(p.draft) }))
}

function credentialSource() {
  if (process.env.GITHUB_TOKEN) return 'GITHUB_TOKEN'
  try {
    execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnv() })
    return 'the gh CLI login'
  } catch (error) {
    // Absent or logged out. Reported by the caller as a loud SKIP with the remedy,
    // never swallowed: the message names what could not be read and why.
    console.warn(`${TAG} gh could not produce a token (${error.message.split('\n')[0]})`)
    return null
  }
}

const invokedDirectly = process.argv[1] && /one-pull-request-at-a-time\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'))
  const parked = record.parked ?? []

  // Always printed, before anything can exit. A baseline nobody reads is an
  // allowlist that rots, and this one is three entries the owner agreed to.
  console.log(`${TAG} reviewed parked record (${parked.length}), last audited ${record._audited ?? 'UNDATED'}:`)
  for (const entry of parked) {
    console.log(`  #${entry.number}  ${entry.branch}`)
    console.log(`    why:         ${entry.why}`)
    console.log(`    unblocked by: ${entry.unblockedBy}`)
  }

  const repo = repositoryFromEnvOrGit()
  if (!repo) {
    console.log(`${TAG} SKIP - no GitHub repository could be determined (no GITHUB_REPOSITORY, no origin remote).`)
    process.exit(0)
  }
  const source = credentialSource()
  if (!source) {
    console.warn(`${TAG} SKIP - NO GITHUB CREDENTIALS HERE (no GITHUB_TOKEN, no gh login), so the open pull request count is UNKNOWN, not one.`)
    console.warn(`${TAG}   Locally, run gh auth login. This is a real gate on the machine that runs the pre-push gate, which is where a pull request is opened.`)
    process.exit(0)
  }

  let open
  try {
    open = await readOpenPullRequests(repo)
  } catch (error) {
    console.error(`${TAG} FAIL - could not list the open pull requests on ${repo}: ${error.message}`)
    process.exit(1)
  }

  const { faults, active, parkedOpen } = judgeOpenPullRequests({ open, parked })

  console.log(`${TAG} ${open.length} pull request(s) open on ${repo}, read with ${source}:`)
  for (const p of open) {
    const held = parked.some((e) => e.number === p.number)
    console.log(`  #${p.number}  ${held ? 'PARKED' : 'ACTIVE'}  ${p.branch}${p.draft ? '  (draft)' : ''}  ${p.title}`)
  }

  declareWork('one-pull-request-at-a-time', {
    did: { 'open pull request read': open.length, 'parked record entry checked': parked.length },
    found: { 'unaccounted-for pull request': active.length, fault: faults.length },
    // A page is 100. At the rule's limit of one this can never bind, but a cap
    // read as a finding is exactly the failure the claim contract exists for, so
    // it names itself rather than being inferred from a suspiciously round number.
    truncated: open.length >= PAGE_SIZE ? [`the listing stops at ${PAGE_SIZE}; there may be more open than this`] : [],
    zeroIsFine: {
      'open pull request read': 'an empty list is the cleanest possible state of this rule, and the parked record is judged against it either way',
      'parked record entry checked': 'an empty parked record is the GOAL state, not a failure: nothing is being held open on purpose',
    },
    // This guard exits with its own verdict below, including the parked-record
    // rot faults, which survive an empty list.
    exitOnZero: false,
  })

  if (faults.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL - ${faults.length} fault(s):`)
    for (const f of faults) console.error(`  ${f}`)
    console.error('')
    console.error(`${TAG}   Close-out PR5: one open pull request at a time. Open the next only when the previous is merged or closed.`)
    console.error(`${TAG}   A pull request held on purpose belongs in scripts/guards/lib/parked-pull-requests.json with a why and an unblockedBy.`)
    process.exit(1)
  }

  console.log(
    `${TAG} PASS - ${active.length} active (limit ${MAX_ACTIVE}), ${parkedOpen.length} parked with a reason, ${open.length} open in total.`,
  )
}
