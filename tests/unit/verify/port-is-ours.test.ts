import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { portRefusal, refuseUnlessThePortIsFree } from '../../../scripts/verify/lib/port-is-ours.mjs'

/*
 * THE DEFECT THESE TESTS HOLD SHUT, stated so the next reader does not have to
 * reconstruct it. On 14 September 2026 the SEO2 drive reported that the
 * verification token was missing from the homepage head. It was not. A dev
 * server was already on port 3200, `next dev` silently took a different port,
 * and the drive measured the server that was already there.
 *
 * The tests bind REAL sockets rather than mocking `node:net`, because the whole
 * point of the helper is that it asks the operating system the same question
 * the spawned server is about to ask. A mock would prove only that the mock was
 * called.
 *
 * EVERY PORT IS ASKED FOR AS 0, which makes the kernel choose a free one. A
 * literal port number in a test is a test that fails on whichever machine
 * happens to be using it, and on this machine three build lanes are running.
 */

let held: Server | null = null

const holdAFreePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '0.0.0.0', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the held socket reported no numeric port'))
        return
      }
      held = server
      resolve(address.port)
    })
  })

const releaseHeldPort = () =>
  new Promise<void>(resolve => {
    if (held === null) {
      resolve()
      return
    }
    const server = held
    held = null
    server.close(() => resolve())
  })

afterEach(async () => {
  await releaseHeldPort()
})

describe('a drive may not measure a server it did not start', () => {
  it('refuses when something already holds the port', async () => {
    const port = await holdAFreePort()
    await expect(
      refuseUnlessThePortIsFree(port, 'before the first server was started'),
    ).rejects.toThrow(/already in use/)
  })

  it('names the port, the phase and the code, so the refusal is actionable', async () => {
    const port = await holdAFreePort()
    const error = await refuseUnlessThePortIsFree(port, 'before the second server was started').catch(
      (caught: unknown) => caught,
    )
    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain(String(port))
    expect(message).toContain('before the second server was started')
    expect(message).toContain('EADDRINUSE')
  })

  it('says first that the product is not at fault, because that is what the defect cost', async () => {
    const port = await holdAFreePort()
    const error = await refuseUnlessThePortIsFree(port, 'before the first server was started').catch(
      (caught: unknown) => caught,
    )
    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain('NOTHING IS WRONG WITH THE PRODUCT')
    // The sentence that stops the investigation must come before the remedy, or
    // a reader skims the remedy and starts looking at the product anyway.
    expect(message.indexOf('NOTHING IS WRONG WITH THE PRODUCT')).toBeLessThan(
      message.indexOf('Stop the process'),
    )
  })

  it('resolves when the port is free', async () => {
    const port = await holdAFreePort()
    await releaseHeldPort()
    await expect(refuseUnlessThePortIsFree(port, 'in a test')).resolves.toBeUndefined()
  })

  it('leaves the port free after proving it, so the caller can still bind it', async () => {
    const port = await holdAFreePort()
    await releaseHeldPort()
    await refuseUnlessThePortIsFree(port, 'in a test')
    // The probe binds to ask the question. If it did not give the port back, the
    // check would be the thing that breaks the run it was added to protect.
    await expect(refuseUnlessThePortIsFree(port, 'a second time')).resolves.toBeUndefined()
  })

  it('carries the operator hint only when the caller supplies one', () => {
    expect(portRefusal(3200, 'in a test', 'EADDRINUSE', 'set SEO2_PORT')).toContain(
      'or set SEO2_PORT',
    )
    const withoutHint = portRefusal(3200, 'in a test', 'EADDRINUSE')
    expect(withoutHint).toContain('Stop the process that owns the port,')
    expect(withoutHint).not.toContain(' or ,')
  })
})
