import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE INSTAGRAM READ BACK, ASKED (the PM's 19:48 of 19 November 2026: 'until then no Instagram post is called live by
 * anyone'). Two Instagram posts of that day held only their Blotato reference after their runs, while the day before's
 * were filled, and Blotato's answer lived only in the run's log. With ?readback=only the social run answers each reference
 * with Blotato's own status, through production, and does nothing else; a manual workflow prints the answer.
 */
// Line endings normalised (the tree carries CRLF; memory: source tests normalise CRLF).
const route = readFileSync(join(process.cwd(), 'src/app/api/cron/social-publish/route.ts'), 'utf8').replace(/\r\n/g, '\n')
const workflow = readFileSync(join(process.cwd(), '.github/workflows/social-readback.yml'), 'utf8')

describe('the read back, asked', () => {
  it('answers every pending reference with its status, after the cron secret is checked', () => {
    const at = route.indexOf("searchParams.get('readback') === 'only'")
    expect(at).toBeGreaterThan(route.indexOf('requireCronAuth(request)'))
    const branch = route.slice(at, route.indexOf('\n  }\n', at))
    expect(branch).toContain('readBackPendingPosts(createAdminClient(), socialPostReaderFromEnv())')
    expect(branch).toMatch(/pending: back\.pending/)
  })

  it('the drill: the branch returns before anything that draws, approves, schedules or publishes', () => {
    const at = route.indexOf("searchParams.get('readback') === 'only'")
    const branch = route.slice(at, route.indexOf('\n  }\n', at))
    for (const call of ['redrawOlderLook(', 'approveUnderStandingPolicy(', 'scheduleApprovedPieces(', 'publishDuePieces(', 'planCampaignWeek(']) {
      expect(branch, call).not.toContain(call)
    }
    expect(branch).toContain('return NextResponse.json(')
  })

  it('is started by hand only, never on a schedule, and asks production with the Actions secret', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/^\s*schedule:/m)
    expect(workflow).toContain("social-publish?readback=only")
    expect(workflow).toContain('secrets.CRON_SECRET')
  })
})
