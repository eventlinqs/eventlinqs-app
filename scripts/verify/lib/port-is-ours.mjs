/**
 * A DRIVE MAY NOT MEASURE A SERVER IT DID NOT START.
 *
 * WHY THIS EXISTS, and it is an incident on this machine rather than a
 * precaution. On 14 September 2026 `scripts/verify/seo2-drive.mjs` reported
 *
 *     FAIL: the configured token is not in the homepage head (got no tag)
 *
 * and the product was not at fault. A dev server for the same worktree was
 * already listening on 3200. `next dev` DOES NOT REFUSE A TAKEN PORT: it picks a
 * different one, says so in a line nobody reads, and the drive then measured the
 * server that was already there, which had been started without the token under
 * test. The harness accused the product of a fault that belonged to the machine,
 * which is the most expensive kind of finding because it is investigated as a
 * defect before it is recognised as noise.
 *
 * THE GUARD THAT EXISTED ONLY EVER COVERED A COLLISION WITH ITSELF. That drive
 * stops its first server and waits three seconds before starting its second,
 * with a comment explaining exactly this hazard. It is correct and it is not
 * enough: this machine runs three build lanes at once, so the collision that
 * actually happens is with a PRE-EXISTING owner, which no amount of waiting for
 * your own child to exit can see.
 *
 * IT PROVES THE PORT IS FREE BY BINDING IT, never by asking whether something
 * answers. A server that is listening but not yet serving refuses a fetch in a
 * way indistinguishable from an empty port, so a fetch would report free at the
 * exact moment the answer is taken. Binding is the same question the spawned
 * server is about to ask, asked first and in the same way.
 *
 * IT IS NOT A GUARD AND MUST NOT BECOME ONE. Nothing here judges the tree; it
 * judges the machine the drive is about to run on, which is why it throws for
 * the drive's own error handler to report rather than exiting a process itself.
 */
import { createServer } from 'node:net'

/**
 * Resolves when nothing holds `port`, throws a named refusal when something
 * does.
 *
 * @param {number} port  the port the caller is about to spawn a server on
 * @param {string} phase where in the run this was asked, said in the refusal so
 *                       a reader knows which of several servers was refused
 * @param {string} hint  what the operator can change, e.g. an env var name
 */
export async function refuseUnlessThePortIsFree(port, phase, hint = '') {
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', error => {
      const code = error && typeof error === 'object' ? error.code : ''
      if (code === 'EADDRINUSE' || code === 'EACCES') {
        reject(new Error(portRefusal(port, phase, code, hint)))
        return
      }
      reject(error)
    })
    probe.once('listening', () => probe.close(() => resolve()))
    probe.listen(port, '0.0.0.0')
  })
}

/**
 * The refusal SENTENCE, separated from the act so it can be read by a test
 * without binding a port, and so every drive that adopts this says the same
 * thing. The wording matters more than it looks: the first clause a reader sees
 * has to stop them investigating the product, because the whole cost of this
 * defect was paid in that investigation.
 */
export function portRefusal(port, phase, code, hint = '') {
  return (
    `port ${port} is already in use (${code}), so this run was refused ${phase}. ` +
    'NOTHING IS WRONG WITH THE PRODUCT and no finding here would be about it: ' +
    'next dev does not refuse a taken port, it quietly chooses another one, and this ' +
    'drive would then have measured whatever server was already there. ' +
    `Stop the process that owns the port${hint ? `, or ${hint}` : ''}, and run it again.`
  )
}
