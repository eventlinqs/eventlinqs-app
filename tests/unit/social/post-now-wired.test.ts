import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * POST ONE NIGHT NOW, FROM OUR SIDE (Lawal, 22 November 2026, 00:32 and his 01:23 standing: posting is done by the engine
 * from our side through Blotato, never through Lawal in the admin). The social run's ?post=now mode is the only way in:
 * after the cron secret, for one night named by its id, through postNightNow; started by hand from a workflow of ours.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const route = read('src/app/api/cron/social-publish/route.ts')
const workflow = read('.github/workflows/social-post-now.yml')
const at = route.indexOf("searchParams.get('post') === 'now'")
const branch = route.slice(at, route.indexOf('\n  }\n', at))

describe('the post now, wired from our side', () => {
  it('runs only after the cron secret is checked, for one night named by its id', () => {
    expect(at).toBeGreaterThan(route.indexOf('requireCronAuth(request)'))
    expect(branch).toMatch(/\[0-9a-f\]\{8\}-/)
    expect(branch).toContain('status: 400')
  })

  it("approves in the standing approval's name, through postNightNow, and records the waiver in the audit log", () => {
    expect(branch).toContain('founderAccount(db)')
    expect(branch).toMatch(/postNightNow\(db, \{ eventId: event, by: founder\.id/)
    expect(branch).toContain("action: 'system.social.post_now'")
    expect(branch).toMatch(/waived: "the posting hours, for this night/)
    expect(branch).toContain('return NextResponse.json(')
  })

  it('is started by hand only, never on a schedule, with the Actions secret, and fails unless the post went', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/^\s*schedule:/m)
    expect(workflow).toContain('social-publish?post=now&event=')
    expect(workflow).toContain('secrets.CRON_SECRET')
    expect(workflow).toContain(`grep -q '"posted":true' answer.json`)
  })

  it('no admin press posts: the admin holds no post now', () => {
    expect(read('src/app/admin/(authed)/social/actions.ts')).not.toContain('postNightNow')
    expect(read('src/lib/admin/rbac.ts')).not.toContain('admin.social.post_now')
  })
})

/*
 * LAWAL'S APPROVED SETS (the founder, 23 November 2026, 14:34): stage intake draws a set unapproved for the PM's review, and
 * stage approve records only the checked approval of a drawn set; neither schedules nor publishes.
 */
const setAt = route.indexOf("if (asked.get('post') === 'now' && (setStage === 'intake' || setStage === 'approve'))")
// The set stages' branch: from its condition to the post now's own comment, which follows it.
const setBranch = route.slice(setAt, route.indexOf('// POST ONE NIGHT NOW, FROM OUR SIDE', setAt))

describe("the approved sets' two stages, wired from our side", () => {
  it('run only after the cron secret, before the night posted now, each through its one engine function', () => {
    expect(setAt).toBeGreaterThan(route.indexOf('requireCronAuth(request)'))
    expect(setAt).toBeLessThan(at)
    expect(setBranch).toContain('drawApprovedSet(db, { set, now })')
    expect(setBranch).toContain('approveApprovedSet(db, { pieceId: piece, by: founder.id, now, siteOrigin: getSiteUrl() })')
    expect(setBranch).toMatch(/\[0-9a-f\]\{8\}-/)
    expect(setBranch).toContain("action: 'system.social.approved_set_intake'")
    expect(setBranch).toContain("action: 'system.social.approved_set_approve'")
  })

  it('stage approve records only an approval: neither stage draws a night, schedules or publishes', () => {
    for (const never of ['scheduleApprovedPieces', 'publishDuePieces', 'postNightNow', 'planCampaignWeek', 'approveUnderStandingPolicy', 'approvePieceChecked', 'socialPublisherFromEnv']) {
      expect(setBranch, never).not.toContain(never)
    }
    expect(setBranch).toContain('scheduled: false')
  })

  it('the workflow carries both stages, with the set and the piece, by hand only', () => {
    expect(workflow).toMatch(/^ {8}options: \[[^\]\n]*\bintake, approve\]$/m)
    expect(workflow).toMatch(/^ {6}set:$/m)
    expect(workflow).toMatch(/^ {6}piece:$/m)
    expect(workflow).toContain('social-publish?post=now&stage=intake&set=${SET}')
    expect(workflow).toContain('social-publish?post=now&stage=approve&piece=${PIECE}')
    expect(workflow).toContain(`intake) grep -q '"drawn":true' answer.json`)
    expect(workflow).toContain(`approve) grep -q '"approved":true' answer.json`)
    expect(workflow).not.toMatch(/^\s*schedule:/m)
  })

  // Two cars adding a stage each merge their inputs WITHOUT a conflict marker, into two 'stage:' keys (git merge-tree of this
  // car with feat/amos-now, 23 November 2026): a workflow with a key twice is never shipped.
  it('names each of its inputs once', () => {
    const inputs = workflow.slice(workflow.indexOf('    inputs:\n'), workflow.indexOf('\npermissions:'))
    const names = [...inputs.matchAll(/^ {6}([a-z_]+):$/gm)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
  })
})
