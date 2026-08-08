/**
 * IDOR-03 and IDOR-04: a caller-supplied identity is not an identity.
 *
 * Both defects had the same shape, found by reading every server action rather
 * than the ones that looked risky. Both wrote or read through the SERVICE-ROLE
 * client, so RLS was off and the application was the only thing standing between
 * one user and another's data.
 *
 * IDOR-03  getMyWaitlists(userId: string)
 *          Took a user id as an ARGUMENT and read that user's waitlist with the
 *          admin client. A server action is a public HTTP endpoint, so anyone
 *          could pass anyone else's id and learn which events they are waiting
 *          for, how many tickets they asked for, and their position. The only
 *          real caller passed `user.id` and looked completely innocent, which is
 *          why reading the call site would not have found it.
 *
 * IDOR-04  leaveQueue({ queueId })
 *          Filtered a privileged UPDATE on the row id alone, so anyone holding a
 *          queue id could set another person's entry to 'abandoned' and take
 *          their place in the queue for a high-demand event. A write with no
 *          authorisation of any kind, on the one surface built to make a fair
 *          queue.
 *
 * THE GENERAL RULE these pin, and it is the one worth carrying: when a privileged
 * client is in use, the caller's identity must come from the SESSION and must
 * reach the query as a FILTER. An argument named userId is an attacker's field.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ')

describe('IDOR-03: getMyWaitlists derives the user from the session', () => {
  const src = code('src/app/actions/waitlist.ts')

  it('no longer accepts a user id as an argument', () => {
    expect(
      src,
      'a userId parameter is a field an attacker controls',
    ).not.toMatch(/export async function getMyWaitlists\s*\(\s*userId/)
  })

  it('takes no arguments at all', () => {
    expect(src).toMatch(/export async function getMyWaitlists\s*\(\s*\)/)
  })

  it('establishes identity with getUser before reading', () => {
    const body = src.slice(src.indexOf('export async function getMyWaitlists'))
    const upToQuery = body.slice(0, body.indexOf(".from('waitlist')"))
    expect(upToQuery, 'the session must be read before the privileged query').toContain(
      'auth.getUser()',
    )
    expect(upToQuery).toMatch(/if \(!user\) return \[\]/)
  })

  it('still filters the query by that derived id', () => {
    // The fix must not merely authenticate; it has to SCOPE. Authentication alone
    // would let any signed-in user read any other user's waitlist.
    const body = src.slice(src.indexOf('export async function getMyWaitlists'))
    expect(body).toMatch(/\.eq\('user_id', userId\)/)
    expect(body).toMatch(/const userId = user\.id/)
  })

  it('the page no longer passes an id, so the fix is not cosmetic', () => {
    expect(read('src/app/(dashboard)/dashboard/my-waitlists/page.tsx')).toMatch(
      /getMyWaitlists\(\)/,
    )
  })
})

describe('IDOR-04: leaveQueue scopes its write to the caller', () => {
  const src = code('src/app/actions/queue.ts')
  const body = src.slice(src.indexOf('export async function leaveQueue'))

  it('requires a session id, so a queue id alone is not enough', () => {
    expect(src).toMatch(/sessionId: z\.string\(\)/)
    expect(body).toMatch(/sessionId: string/)
  })

  it('filters the update by session_id, not only by row id', () => {
    const update = body.slice(0, body.indexOf('.eq(\'status\', \'waiting\')') + 40)
    expect(update).toMatch(/\.eq\('id', parsed\.data\.queueId\)/)
    expect(
      update,
      'without a session_id filter, any queue id abandons any entry',
    ).toMatch(/\.eq\('session_id', parsed\.data\.sessionId\)/)
  })

  it('additionally binds a signed-in caller to their own entry', () => {
    // So a leaked session id cannot remove an entry somebody has claimed.
    expect(body).toMatch(/user_id\.eq\.\$\{user\.id\}/)
  })

  it('the client passes the session id through', () => {
    expect(read('src/app/queue/[slug]/queue-room.tsx')).toMatch(
      /leaveQueue\(\{ queueId, sessionId: getOrCreateSessionId\(\) \}\)/,
    )
  })
})

describe('the class: no action takes a bare userId argument alongside a privileged client', () => {
  it('sweeps every server action', () => {
    // A different implementation from the entry-point scanner, so a shared blind
    // spot cannot hide an instance from both. This is the pattern that produced
    // IDOR-03, expressed so a NEW action cannot reintroduce it unnoticed.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const full = path.join(dir, e)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(full)
      }
      return out
    }

    const offenders: string[] = []
    for (const file of walk(path.join(ROOT, 'src/app'))) {
      const raw = readFileSync(file, 'utf8')
      if (!/^['"]use server['"]/m.test(raw)) continue
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ')
      if (!/createAdminClient\s*\(/.test(stripped)) continue
      // An exported action whose FIRST parameter is a bare user identifier.
      for (const m of stripped.matchAll(
        /export\s+async\s+function\s+([a-zA-Z_$][\w$]*)\s*\(\s*(userId|user_id|uid)\s*:/g,
      )) {
        offenders.push(`${path.relative(ROOT, file)}::${m[1]}`)
      }
    }
    expect(
      offenders,
      `these take a caller-supplied user id and use a privileged client: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
