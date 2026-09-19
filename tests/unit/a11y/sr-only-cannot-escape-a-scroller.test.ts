import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A SCREEN-READER LABEL MAY NOT ESCAPE THE BOX THAT SCROLLS IT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, MEASURED ON 19 September 2026.
 *
 * `sr-only` is `position: absolute`, and an absolutely positioned element is
 * clipped by an ancestor's `overflow` ONLY when that ancestor is its CONTAINING
 * BLOCK. `overflow` alone does not create one. So a label inside a horizontally
 * scrolling table was laid out at its position in the FULL table width:
 *
 *     /admin/users     documentElement.scrollWidth 569 against innerWidth 390
 *     /admin/events    594
 *     /admin/organisers 605
 *     /admin/orders    390   <- identical table markup, no sr-only inside it
 *
 * Under mobile emulation the layout viewport grows to fit the document, so the
 * whole screen rendered at about 69 per cent.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS, AND WHY THE LAST GROUP IS THE IMPORTANT ONE.
 *
 * The guard is EXECUTED against synthetic trees, red and green, because a rule
 * that has never been watched to fail is not a rule. The last group points it at
 * the shape that defeated its first version: the label rendered by a sibling
 * component in the same file rather than lexically inside the container. That
 * version reported OK on both pages the defect was actually found on.
 */

const ROOT = process.cwd()
const GUARD = join(ROOT, 'scripts/guards/sr-only-cannot-escape-a-scroller.mjs')

function runAgainst(files: Record<string, string>): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sr-only-scroller-'))
  try {
    for (const [name, body] of Object.entries(files)) {
      const full = join(dir, name)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, body, 'utf8')
    }
    try {
      const out = execFileSync(process.execPath, [GUARD], {
        encoding: 'utf8',
        env: { ...process.env, SR_ONLY_SCAN_ROOT: dir },
      })
      return { code: 0, out }
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string }
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const SCROLLER_WITHOUT_RELATIVE = `export function Table() {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px]">
        <tbody>
          <tr>
            <td>
              <label className="sr-only" htmlFor="role">New role</label>
              <select id="role" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
`

const SCROLLER_WITH_RELATIVE = SCROLLER_WITHOUT_RELATIVE.replace(
  'className="overflow-x-auto',
  'className="relative overflow-x-auto',
)

/** The shape that defeated the first version: the label is in a sibling component. */
const LABEL_IN_A_SIBLING_COMPONENT = `export function Table({ rows }: { rows: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px]">
        <tbody>{rows.map(r => <Row key={r} id={r} />)}</tbody>
      </table>
    </div>
  )
}

function Row({ id }: { id: string }) {
  return (
    <tr>
      <td>
        <label className="sr-only" htmlFor={id}>New role</label>
        <select id={id} />
      </td>
    </tr>
  )
}
`

describe('the guard refuses a scroller that is not a containing block', () => {
  it('fails on a horizontal scroller holding an sr-only label, and names the file and line', () => {
    const r = runAgainst({ 'table.tsx': SCROLLER_WITHOUT_RELATIVE })
    expect(r.code).toBe(1)
    expect(r.out).toContain('but is not a containing block')
    expect(r.out).toContain('table.tsx:3')
    expect(r.out).toContain('Add `relative`')
  })

  it('passes once the scroller carries relative', () => {
    const r = runAgainst({ 'table.tsx': SCROLLER_WITH_RELATIVE })
    expect(r.code).toBe(0)
    expect(r.out).toContain('[sr-only-scroller] OK')
  })

  it('accepts any token that makes a containing block, not only relative', () => {
    for (const token of ['sticky', 'fixed', 'transform', 'contain-paint']) {
      const r = runAgainst({
        'table.tsx': SCROLLER_WITHOUT_RELATIVE.replace(
          'className="overflow-x-auto',
          `className="${token} overflow-x-auto`,
        ),
      })
      expect(r.code, `${token} should satisfy the rule`).toBe(0)
    }
  })

  it('leaves a file with no sr-only alone, which is what /admin/orders was', () => {
    const r = runAgainst({
      'orders.tsx': SCROLLER_WITHOUT_RELATIVE.replace(
        '<label className="sr-only" htmlFor="role">New role</label>',
        '<span>Order</span>',
      ),
    })
    expect(r.code).toBe(0)
  })

  it('leaves a VERTICAL scroller alone: the defect is horizontal', () => {
    const r = runAgainst({
      'panel.tsx': SCROLLER_WITHOUT_RELATIVE.replace('overflow-x-auto', 'overflow-y-auto'),
    })
    expect(r.code).toBe(0)
  })
})

describe('the shape that defeated the first version of this guard', () => {
  it('fails when the label is rendered by a sibling component in the same file', () => {
    const r = runAgainst({ 'users.tsx': LABEL_IN_A_SIBLING_COMPONENT })
    expect(r.code).toBe(1)
    expect(r.out).toContain('but is not a containing block')
  })

  it('passes when that container carries relative', () => {
    const r = runAgainst({
      'users.tsx': LABEL_IN_A_SIBLING_COMPONENT.replace(
        'className="overflow-x-auto',
        'className="relative overflow-x-auto',
      ),
    })
    expect(r.code).toBe(0)
  })
})

describe('the guard refuses to judge on a premise that has moved', () => {
  it('reads the real globals.css and finds sr-only is still Tailwind\'s own utility', () => {
    const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
    expect(css).not.toMatch(/\.sr-only\s*\{/)
  })
})

describe('the real tree', () => {
  it('has no horizontal container in an sr-only file that is not a containing block', () => {
    const r = runAgainst({})
    // An empty fixture directory would report a broken sweep, so this case runs
    // the guard over src/ itself by leaving SR_ONLY_SCAN_ROOT at its default.
    expect(r.out).toContain('the sweep matched no files at all')

    const real = execFileSync(process.execPath, [GUARD], { encoding: 'utf8' })
    expect(real).toContain('[sr-only-scroller] OK')
    expect(real).toContain('0 horizontal containers that is not a containing block')
  })
})
