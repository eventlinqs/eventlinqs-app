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
