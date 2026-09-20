import { afterEach, describe, expect, test } from 'vitest'
import { createServer, type Server } from 'node:http'
import { parityStandInAnswers } from '../../../scripts/verify/sentry-parity-sink.mjs'

/**
 * "I COULD NOT BIND" IS NOT "THERE IS NO SINK".
 *
 * THE RUN THAT PUT THIS HERE, 20 September 2026. A push that had passed 15 of
 * 16 gate steps was refused at the sixteenth in 11 seconds:
 *
 *     [sentry-parity-sink] could not listen on 127.0.0.1:9411: listen EADDRINUSE
 *     [gate] the Sentry parity sink is not answering on 127.0.0.1:9411:
 *            the server exited with 1 before answering
 *
 * A probe sent to that port a moment later answered `200 {"id":"000...0"}` with
 * `access-control-allow-origin: *`. Three lanes share this laptop and one fixed
 * port, so the ordinary case when our own sink cannot start is that a sibling
 * lane's IDENTICAL sink is already listening, and the condition the gate needs
 * was satisfied the whole time. The build was refused for not owning a socket.
 *
 * The condition is "a sink ANSWERS on this port", never "this process owns it".
 * These tests hold both halves of that: it must accept a real sink, and it must
 * refuse everything else, because borrowing something that is not a sink would
 * put the console error straight back while reporting that all was well.
 */

let servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))))
  servers = []
})

/** Start a server on an ephemeral port and return it. */
async function listening(handler: Parameters<typeof createServer>[0]): Promise<number> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('no port')
  return address.port
}

/** Exactly what scripts/verify/sentry-parity-sink.mjs answers. */
const realSink: Parameters<typeof createServer>[0] = (req, res) => {
  req.resume()
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ id: '0'.repeat(32) }))
  })
}

describe('parityStandInAnswers', () => {
  test('ACCEPTS a sink that is already listening, which is the whole point', async () => {
    const port = await listening(realSink)
    const verdict = await parityStandInAnswers(port)
    expect(verdict.ok).toBe(true)
    expect(verdict.detail).toMatch(/32-character event id/)
  })

  test('REFUSES when nothing is listening at all', async () => {
    // An ephemeral port taken and immediately released: nothing answers.
    const port = await listening(realSink)
    await new Promise<void>((r) => servers.pop()!.close(() => r()))
    const verdict = await parityStandInAnswers(port, 1500)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toMatch(/nothing answered/)
  })

  test('REFUSES a foreign server that merely holds the port', async () => {
    // The case the original refusal was written for, and it is preserved.
    const port = await listening((req, res) => {
      req.resume()
      res.writeHead(404)
      res.end('not here')
    })
    const verdict = await parityStandInAnswers(port)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toMatch(/answered 404/)
  })

  test('REFUSES a 200 that is not JSON, so a static file server cannot pass', async () => {
    const port = await listening((req, res) => {
      req.resume()
      res.writeHead(200, { 'access-control-allow-origin': '*' })
      res.end('<html>hello</html>')
    })
    const verdict = await parityStandInAnswers(port)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toMatch(/not JSON/)
  })

  test('REFUSES a 200 JSON with no event id', async () => {
    const port = await listening((req, res) => {
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify({ ok: true }))
    })
    const verdict = await parityStandInAnswers(port)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toMatch(/no 32-character event id/)
  })

  test('REFUSES a 200 JSON whose id is the wrong length, because a near miss is not a sink', async () => {
    const port = await listening((req, res) => {
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify({ id: 'abc' }))
    })
    const verdict = await parityStandInAnswers(port)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toMatch(/no 32-character event id/)
  })

  test('REFUSES a sink-shaped body served without the CORS header', async () => {
    // The header is not decoration: the SDK's request is cross-origin from the
    // audited page, so a sink that omits it would still produce the console
    // error this whole mechanism exists to avoid.
    const port = await listening((req, res) => {
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: '0'.repeat(32) }))
    })
    const verdict = await parityStandInAnswers(port)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toMatch(/CORS header/)
  })

  test('never throws, so a caller can always print the reason', async () => {
    // Port 1 on a non-root process: the connection is refused, not hung.
    await expect(parityStandInAnswers(1, 1500)).resolves.toMatchObject({ ok: false })
  })
})
