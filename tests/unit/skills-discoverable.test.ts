/**
 * EVERY PROJECT SKILL MUST ACTUALLY LOAD.
 *
 * Claude Code discovers a project skill at `.claude/skills/<name>/SKILL.md` and
 * at that path only. A directory whose entry file is named anything else is
 * invisible: it is committed, it is reviewed, it sits in the tree looking
 * present, and it is never offered to a session.
 *
 * That is not hypothetical. `brief-roast` shipped as
 * `.claude/skills/brief-roast/brief-roast-SKILL.md` and so never loaded in any
 * worktree or any session, while the five skills beside it, all named
 * `SKILL.md`, loaded every time. The skill that exists to block a premature
 * claim of DONE was itself silently absent, which is the exact class of failure
 * it was written to catch.
 *
 * A naming convention held only by habit is not held at all, so this test holds
 * it instead. It is the same doctrine the environment manifest applies to
 * configuration: declare the contract once, then let a machine fail on a
 * violation rather than trusting a human to notice.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills')

function skillDirectories(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return []
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

describe('project skills are discoverable', () => {
  it('finds at least one skill directory, so this test cannot pass vacuously', () => {
    expect(skillDirectories().length).toBeGreaterThan(0)
  })

  it.each(skillDirectories())('%s carries an entry file named exactly SKILL.md', name => {
    const dir = path.join(SKILLS_DIR, name)
    const present = fs.readdirSync(dir)

    expect(
      present,
      `.claude/skills/${name}/ has no SKILL.md, so this skill will NEVER be offered to a ` +
        `session. Claude Code reads .claude/skills/<name>/SKILL.md and no other filename. ` +
        `Found instead: ${present.join(', ') || '(nothing)'}. Rename the entry file to SKILL.md.`,
    ).toContain('SKILL.md')
  })

  it.each(skillDirectories())('%s declares a name and a description in its frontmatter', name => {
    const file = path.join(SKILLS_DIR, name, 'SKILL.md')
    if (!fs.existsSync(file)) return

    const body = fs.readFileSync(file, 'utf8')
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)

    expect(frontmatter, `.claude/skills/${name}/SKILL.md has no YAML frontmatter block`).not.toBeNull()

    const block = frontmatter?.[1] ?? ''
    expect(block, `.claude/skills/${name}/SKILL.md frontmatter declares no name:`).toMatch(/^name:\s*\S/m)
    expect(block, `.claude/skills/${name}/SKILL.md frontmatter declares no description:`).toMatch(
      /^description:\s*\S/m,
    )
  })
})
