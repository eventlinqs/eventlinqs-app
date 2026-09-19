import { describe, it, expect, vi } from 'vitest'
import {
  accountIsGone,
  tearDownAccount,
  tearDownAccountOrFailTheRun,
} from '../../../scripts/verify/lib/teardown-account.mjs'

/**
 * THE JUDGEMENT A TEARDOWN MAKES, tested where the branches are reachable.
 *
 * A drive against TEST exercises exactly one of these branches: the one where
 * everything works. The branch that matters is the other one, and on
 * 19 September it was unreachable by construction, because every teardown in
 * the repository discarded the error before anything could judge it. Eighteen
 * accounts accumulated on TEST while every run printed a clean tear-down.
 */

describe('a teardown asks "is it gone", not "did my call succeed"', () => {
  it('counts no error as gone', () => {
    expect(accountIsGone(null)).toBe(true)
    expect(accountIsGone(undefined)).toBe(true)
  })

  it('counts an account that was already absent as gone, by its code', () => {
    // OBSERVED against TEST on 19 September 2026, not assumed:
    // deleteUser('00000000-0000-4000-8000-00000000dead') answers
    // { name: 'AuthApiError', status: 404, code: 'user_not_found' }.
    expect(accountIsGone({ status: 404, code: 'user_not_found', message: 'User not found' })).toBe(true)
  })

  it('counts a 404 as gone even if the code changes', () => {
    expect(accountIsGone({ status: 404, message: 'not here' })).toBe(true)
  })

  it('falls back to the message, narrowly, for a client that stops sending a code', () => {
    expect(accountIsGone({ message: 'User not found' })).toBe(true)
    expect(accountIsGone({ message: 'user NOT FOUND' })).toBe(true)
  })

  it('counts a REFUSAL as not gone, which is the whole point', () => {
    // The real one, from 19 September: a statement-level trigger refusing the
    // UPDATE that a cascading foreign key issues.
    expect(
      accountIsGone({
        status: 500,
        code: '42501',
        message: 'append only: UPDATE on public.marketing_capture_placement is refused',
      }),
    ).toBe(false)
  })

  it('counts a permission failure as not gone', () => {
    expect(accountIsGone({ status: 403, code: 'not_admin', message: 'forbidden' })).toBe(false)
  })

  it('counts a transport failure as not gone', () => {
    expect(accountIsGone({ message: 'fetch failed' })).toBe(false)
  })
})

describe('tearDownAccount reports what actually happened', () => {
  const clientAnswering = (error: unknown) => ({
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error }) } },
  })

  it('says the account is removed when it is', async () => {
    const result = await tearDownAccount(clientAnswering(null), 'abc')
    expect(result.gone).toBe(true)
    expect(result.detail).toContain('abc')
    expect(result.detail).toContain('removed')
  })

  it('says the account is removed when it was already absent', async () => {
    const result = await tearDownAccount(clientAnswering({ status: 404, code: 'user_not_found' }), 'abc')
    expect(result.gone).toBe(true)
  })

  it('names the refusal, and says what it costs the next run', async () => {
    const result = await tearDownAccount(
      clientAnswering({ status: 500, message: 'append only: UPDATE ... is refused' }),
      'abc',
    )
    expect(result.gone).toBe(false)
    expect(result.detail).toContain('REFUSED')
    expect(result.detail).toContain('append only')
    expect(result.detail).toContain('fail to create it')
  })

  it('treats a THROWN failure as a refusal rather than swallowing it', async () => {
    // The old shape was `.catch(() => {})`, which turned exactly this case into
    // silence.
    const client = { auth: { admin: { deleteUser: vi.fn().mockRejectedValue(new Error('socket hang up')) } } }
    const result = await tearDownAccount(client, 'abc')
    expect(result.gone).toBe(false)
    expect(result.detail).toContain('socket hang up')
  })
})

describe('the form every drive calls fails the run rather than only printing', () => {
  const withExitCodeRestored = async (body: () => Promise<void>) => {
    const before = process.exitCode
    try {
      await body()
    } finally {
      process.exitCode = before
    }
  }

  it('leaves the exit code alone when the account is gone', async () => {
    await withExitCodeRestored(async () => {
      process.exitCode = 0
      const client = { auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } } }
      await tearDownAccountOrFailTheRun(client, 'abc')
      expect(process.exitCode).toBe(0)
    })
  })

  it('leaves the exit code alone when the account was already absent', async () => {
    await withExitCodeRestored(async () => {
      process.exitCode = 0
      const client = {
        auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: { status: 404, code: 'user_not_found' } }) } },
      }
      await tearDownAccountOrFailTheRun(client, 'abc')
      expect(process.exitCode).toBe(0)
    })
  })

  it('FAILS THE RUN when the deletion was refused', async () => {
    // Printing alone is what the repository already had: the accounts piled up
    // while every run printed a clean tear-down and exited 0.
    await withExitCodeRestored(async () => {
      process.exitCode = 0
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const client = {
        auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: { status: 500, message: 'refused' } }) } },
      }
      await tearDownAccountOrFailTheRun(client, 'abc')
      expect(process.exitCode).toBe(1)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('REFUSED'))
      spy.mockRestore()
    })
  })

  it('does not call the API at all when there is no id to remove', async () => {
    const deleteUser = vi.fn()
    const result = await tearDownAccountOrFailTheRun({ auth: { admin: { deleteUser } } }, null)
    expect(deleteUser).not.toHaveBeenCalled()
    expect(result.gone).toBe(true)
  })
})
