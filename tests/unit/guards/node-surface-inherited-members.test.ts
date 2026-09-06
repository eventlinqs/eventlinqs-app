import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * THE NODE SURFACE MANIFEST RECORDS WHAT A GLOBAL INHERITS (7 September 2026).
 * scripts/guards/node-version-contract.mjs reads scripts/guards/lib/node-surface.json
 * as an allowlist of what the contract Node provides. The generator recorded
 * only each global's OWN property names, so `process.on`, which process
 * inherits as an EventEmitter, was reported as an API Node 24 does not provide
 * the first time a script registered a signal handler. This pins the
 * regenerated manifest: the inherited members are there, and the root
 * prototypes' members are not smeared across every global.
 */
describe('the Node surface manifest', () => {
  test('process carries its EventEmitter members, and Object does not carry Function.prototype members', () => {
    const surface = JSON.parse(readFileSync(join(process.cwd(), 'scripts', 'guards', 'lib', 'node-surface.json'), 'utf8')) as {
      globals: Record<string, string[]>
    }
    for (const member of ['on', 'once', 'off', 'emit', 'exit', 'exitCode', 'kill']) {
      expect(surface.globals.process, `process.${member}`).toContain(member)
    }
    for (const member of ['bind', 'call', 'apply']) expect(surface.globals.Object, `Object.${member}`).not.toContain(member)
    expect(surface.globals.Object).toContain('groupBy')
  })
})
