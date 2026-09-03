/**
 * THE SERVER-SIDE UPLOAD SIZE GATE, AND WHERE IT SITS IN THE SEQUENCE.
 *
 * WHY THIS EXISTS. The break attempt "upload an image far over the size limit"
 * sat at READ NOT DRIVEN for a week, because the only evidence for it was
 * somebody reading `if (file.size > MAX_IMAGE_BYTES)` at src/lib/upload.ts:106.
 * A code reading is not a pass, and this project has been wrong from a static
 * read eight times.
 *
 * scripts/verify/oversize-upload-drive.mjs now drives the CLIENT gate in a real
 * browser, which is the gate a person meets. It deliberately does NOT claim to
 * drive the server gate, and the reason is worth writing down: the client
 * refuses first, so no oversized request is ever sent, so a browser can never
 * exercise the server branch. Any script claiming otherwise would be making
 * exactly the overclaim the READ NOT DRIVEN label existed to prevent.
 *
 * The server gate is the one that matters against an attacker, who does not run
 * our client. It cannot be driven end to end in a unit test either, because
 * uploadEventImage is a server action that authenticates, rate-limits and talks
 * to storage. So, following the rule the constitution already sets for the
 * image pipeline ("where it cannot be produced locally, pin the decision in a
 * pure function and test that exhaustively"), what is pinned here is the
 * DECISION and its ORDER, which is the part that can silently rot:
 *
 *   1. the threshold is the shared constant, not a second copy of "10MB";
 *   2. the size test comes BEFORE arrayBuffer(), so oversized bytes are never
 *      read into memory and never reach the native decoder, which is the whole
 *      security value of the check and is a property of the SOURCE ORDER, not
 *      of any value it returns;
 *   3. an empty file is refused too, and refused differently, so the two
 *      refusals cannot be confused for one another;
 *   4. the boundary is exclusive: exactly MAX_IMAGE_BYTES is allowed and one
 *      byte more is not.
 *
 * Point 2 is asserted against the file's own text on purpose. It is an ordering
 * property, and ordering is precisely what a refactor moves without changing
 * any test that only looks at return values.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'

const UPLOAD_SOURCE = readFileSync(join(process.cwd(), 'src/lib/upload.ts'), 'utf8')

/** The decision upload.ts makes, extracted so it can be exercised exhaustively. */
function sizeVerdict(bytes: number): 'empty' | 'too-large' | 'accepted' {
  if (bytes === 0) return 'empty'
  if (bytes > MAX_IMAGE_BYTES) return 'too-large'
  return 'accepted'
}

describe('the upload size gate', () => {
  it('uses the shared limit and that limit is 10MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024)
    expect(UPLOAD_SOURCE).toContain("import { MAX_IMAGE_BYTES } from '@/lib/media/limits'")
    expect(UPLOAD_SOURCE).toContain('file.size > MAX_IMAGE_BYTES')
  })

  it('does not carry a second, hardcoded copy of the byte cap', () => {
    // A literal 10485760 or `10 * 1024 * 1024` in upload.ts would be a second
    // source that can drift from the shared one, which is the defect class the
    // fee system removed for pricing.
    expect(UPLOAD_SOURCE).not.toMatch(/10\s*\*\s*1024\s*\*\s*1024/)
    expect(UPLOAD_SOURCE).not.toContain('10485760')
  })

  it('REFUSES ON SIZE BEFORE IT READS THE BYTES, so oversized input never reaches the decoder', () => {
    const sizeCheck = UPLOAD_SOURCE.indexOf('file.size > MAX_IMAGE_BYTES')
    const readBytes = UPLOAD_SOURCE.indexOf('await file.arrayBuffer()')
    const decode = UPLOAD_SOURCE.indexOf('processEventImage(')

    expect(sizeCheck, 'the size check must exist').toBeGreaterThan(-1)
    expect(readBytes, 'arrayBuffer() must exist').toBeGreaterThan(-1)
    expect(decode, 'processEventImage() must exist').toBeGreaterThan(-1)

    // This is the security property. If a refactor moves the size check below
    // the read, a 500MB upload is pulled into memory before anything refuses it,
    // and the native decoder is handed attacker-controlled bytes it was never
    // meant to see. Nothing about the returned values would change.
    expect(sizeCheck).toBeLessThan(readBytes)
    expect(readBytes).toBeLessThan(decode)
  })

  it('refuses an empty file separately from an oversized one', () => {
    expect(UPLOAD_SOURCE).toContain('file.size === 0')
    expect(sizeVerdict(0)).toBe('empty')
    // The two refusals say different things, so an organiser is never told to
    // shrink a file that is actually empty.
    expect(UPLOAD_SOURCE).toContain('That file is empty.')
    expect(UPLOAD_SOURCE).toContain('Image must be under 10MB.')
  })

  it('treats the boundary as exclusive: exactly the cap is allowed, one byte more is not', () => {
    expect(sizeVerdict(MAX_IMAGE_BYTES - 1)).toBe('accepted')
    expect(sizeVerdict(MAX_IMAGE_BYTES)).toBe('accepted')
    expect(sizeVerdict(MAX_IMAGE_BYTES + 1)).toBe('too-large')
  })

  it('refuses every size a break attempt would try', () => {
    const attempts = [
      12 * 1024 * 1024,
      50 * 1024 * 1024,
      500 * 1024 * 1024,
      Number.MAX_SAFE_INTEGER,
    ]
    for (const bytes of attempts) expect(sizeVerdict(bytes)).toBe('too-large')
  })

  it('checks the size before it checks permission, so no oversized read is done for a stranger either', () => {
    const sizeCheck = UPLOAD_SOURCE.indexOf('file.size > MAX_IMAGE_BYTES')
    /*
     * ANCHOR ON THE CALL, NOT THE NAME. The first written version of this used
     * indexOf('callerCanWriteEvent('), which found the function's own
     * DEFINITION earlier in the file and compared the size check against that.
     * It failed, and it was the test that was wrong, not the ordering: the
     * definition sits at the top and the call sits two lines below the size
     * check, exactly where it should. A position assertion has to name the
     * position it means.
     */
    const permission = UPLOAD_SOURCE.indexOf('await callerCanWriteEvent(supabase, user.id, eventId)')
    expect(permission, 'the permission call site must exist').toBeGreaterThan(-1)
    expect(sizeCheck).toBeLessThan(permission)
  })
})
