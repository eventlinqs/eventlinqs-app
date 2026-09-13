import { describe, expect, test } from 'vitest'
import { appendFileSync, closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStepLog } from '../../../scripts/ops/pre-push-gate.mjs'

/**
 * THE INBOX EVERY DRIVE READS MUST SURVIVE A SECOND WRITER.
 *
 * `startGateServer` hands one file descriptor to the server, the Upstash stub
 * and any extra process a step needs. The drives then read that same file as an
 * INBOX, because `EMAIL_TRANSPORT=console` prints every message the server
 * sends, and two of them (`d2-recovery-proof.mjs`, `d2-waitlist-proof.mjs`) also
 * WRITE to it: they run the recovery engine as a subprocess, capture its mail as
 * a string, and `appendFileSync` it in so the engine's messages land in the same
 * inbox.
 *
 * That makes two writers with independent file offsets, and until 14 September
 * 2026 the descriptor was opened `'w'`. A `'w'` descriptor's offset only moves
 * when its owner writes, so every append moved end-of-file PAST the server's
 * stale offset and the server's next line landed on top of the message the
 * harness had just added. The D2 recovery proof at 768 reported "the sequence is
 * three messages" as a failure with two in the inbox, while the database held
 * the send and the engine's own sweep reported `sent: 3`.
 *
 * These tests drive the real shape with a real child process and a real
 * appender. The second one is the NEGATIVE CONTROL: it asserts that the old
 * `'w'` really does destroy the appended lines on this platform, so if some
 * future runtime made a shared `'w'` descriptor safe, this file would say so
 * out loud rather than passing for a reason that no longer exists.
 */

const ROUNDS = 10
const HARNESS_LINE = /^HARNESS \d+ H{80}$/

/**
 * A long-lived child that writes one line to its stdout every time it is told
 * to on stdin, so the test decides exactly when the child writes relative to
 * its own append. Written to disk because a child needs a file to run.
 */
const CHILD_SOURCE = `
let n = 0
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  for (const _ of chunk.split('\\n').filter(Boolean)) {
    process.stdout.write(\`SERVER \${n} \${'S'.repeat(40)}\\n\`)
    n += 1
  }
})
process.stdin.on('end', () => process.exit(0))
`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Runs the real interleaving against a descriptor opened however `open` says,
 * and returns how many of the appended lines came out whole.
 */
async function appendedLinesSurviving(open: (path: string) => number): Promise<{ appended: number; intact: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'eventlinqs-step-log-'))
  const childPath = join(dir, 'child.mjs')
  const logPath = join(dir, 'step.log')
  writeFileSync(childPath, CHILD_SOURCE, 'utf8')

  const fd = open(logPath)
  const child = spawn(process.execPath, [childPath], { stdio: ['pipe', fd, fd] })
  // Narrowed once, and it is a real precondition rather than a type nuisance:
  // the whole test turns on the parent deciding WHEN the child writes, which it
  // can only do through this pipe.
  const tellChildToWrite = child.stdin
  if (!tellChildToWrite) throw new Error('the child was spawned without a stdin pipe, so nothing can be timed')
  await sleep(250)

  let appended = 0
  for (let round = 0; round < ROUNDS; round += 1) {
    tellChildToWrite.write('line\n')
    await sleep(60)
    appendFileSync(logPath, `HARNESS ${round} ${'H'.repeat(80)}\n`, 'utf8')
    appended += 1
    await sleep(60)
    tellChildToWrite.write('line\n')
    await sleep(60)
  }
  tellChildToWrite.end()
  await new Promise((r) => child.on('exit', r))
  closeSync(fd)

  const lines = readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean)
  return { appended, intact: lines.filter((l) => HARNESS_LINE.test(l)).length }
}

describe('openStepLog: a second writer cannot be overwritten', () => {
  test(
    'every line the harness appends survives the child writing beside it',
    async () => {
      const { appended, intact } = await appendedLinesSurviving(openStepLog)
      expect(appended).toBe(ROUNDS)
      expect(intact).toBe(ROUNDS)
    },
    60_000,
  )

  test(
    'NEGATIVE CONTROL: the old truncating open really does destroy them',
    async () => {
      const { appended, intact } = await appendedLinesSurviving((path) => {
        writeFileSync(path, '')
        return openSync(path, 'w')
      })
      expect(appended).toBe(ROUNDS)
      // Not "fewer than all": at least one must be gone, or this file is no
      // longer testing the thing it was written for and should be deleted.
      expect(intact).toBeLessThan(ROUNDS)
    },
    60_000,
  )

  test('a fresh step log starts empty, which is what every caller already relied on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eventlinqs-step-log-'))
    const logPath = join(dir, 'step.log')
    writeFileSync(logPath, 'what the previous step wrote\n', 'utf8')
    const fd = openStepLog(logPath)
    appendFileSync(logPath, 'this step\n', 'utf8')
    closeSync(fd)
    expect(readFileSync(logPath, 'utf8')).toBe('this step\n')
  })
})
