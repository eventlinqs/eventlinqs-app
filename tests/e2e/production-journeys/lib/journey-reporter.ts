import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The sweep's own record: one row per journey per width, PASS or FAIL, its time, every step with its time and photograph,
 * and for a failure the exact failing line and the words it failed with. Written to JOURNEY_OUT as summary.json (read by
 * the monitor and /admin/health) and summary.md (read by a person).
 */

type Step = { n: number; name: string; ms: number; ok: boolean; shot: string | null; error?: string; at?: string }
type Row = {
  journey: string
  width: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  ms: number
  retries: number
  failing?: { step?: string; at?: string; error: string }
  steps: Step[]
  faults: { kind: string; detail: string; url?: string }[]
}

const plain = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

export default class JourneyReporter implements Reporter {
  private rows = new Map<string, Row>()
  private startedAt = new Date()

  onTestEnd(test: TestCase, result: TestResult): void {
    const width = test.parent.project()?.name ?? 'unknown'
    const att = result.attachments.find((a) => a.name === 'journey-steps')
    let steps: Step[] = []
    let faults: Row['faults'] = []
    if (att?.body) {
      try {
        const parsed = JSON.parse(att.body.toString('utf8'))
        steps = parsed.steps ?? []
        faults = parsed.faults ?? []
      } catch {
        /* keep the row without its steps */
      }
    }
    const status: Row['status'] = result.status === 'passed' ? 'PASS' : result.status === 'skipped' ? 'SKIP' : 'FAIL'
    const failedStep = steps.find((s) => !s.ok)
    const err = result.errors[0] ?? result.error
    const row: Row = {
      journey: test.titlePath().slice(1).filter(Boolean).slice(-2).join(' > '),
      width,
      status,
      ms: result.duration,
      retries: result.retry,
      steps,
      faults,
    }
    if (status === 'FAIL') {
      const loc = err?.location ? `${path.relative(process.cwd(), err.location.file).replace(/\\/g, '/')}:${err.location.line}` : undefined
      row.failing = {
        step: failedStep?.name,
        at: failedStep?.at ?? loc,
        error: plain(failedStep?.error ?? err?.message ?? result.status).split('\n').slice(0, 6).join(' ').slice(0, 700),
      }
    }
    // The last attempt wins: a retry that passes replaces the failure, and says it was retried.
    this.rows.set(`${width}::${test.id}`, row)
  }

  onEnd(result: FullResult): void {
    const out = process.env.JOURNEY_OUT ?? 'test-results/journeys/adhoc'
    mkdirSync(out, { recursive: true })
    const rows = [...this.rows.values()]
    const pass = rows.filter((r) => r.status === 'PASS').length
    const fail = rows.filter((r) => r.status === 'FAIL').length
    const summary = {
      base: process.env.JOURNEY_BASE ?? 'https://www.eventlinqs.com.au',
      started: this.startedAt.toISOString(),
      ended: new Date().toISOString(),
      overall: result.status,
      pass,
      fail,
      skip: rows.length - pass - fail,
      rows,
    }
    writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2))
    const lines = [
      `# Production journeys, ${summary.started}`,
      '',
      `Site: ${summary.base}. ${pass} PASS, ${fail} FAIL, ${summary.skip} SKIP.`,
      '',
      '| Width | Journey | Result | Seconds | Failing line | Why |',
      '|---|---|---|---|---|---|',
      ...rows.map(
        (r) =>
          `| ${r.width} | ${r.journey} | ${r.status}${r.retries ? ` (retry ${r.retries})` : ''} | ${(r.ms / 1000).toFixed(1)} | ${r.failing?.at ?? ''} | ${(r.failing ? `${r.failing.step ? `${r.failing.step}: ` : ''}${r.failing.error}` : '').replace(/\|/g, '/')} |`,
      ),
      '',
      '## Steps',
      ...rows.flatMap((r) => [
        '',
        `### ${r.width} ${r.journey}: ${r.status}`,
        ...r.steps.map((s) => `- ${s.ok ? 'ok' : 'FAIL'} ${s.n}. ${s.name} (${s.ms} ms)${s.shot ? ` ${s.shot}` : ''}${s.error ? ` | ${s.error}` : ''}`),
        ...(r.faults.length ? [`- page faults: ${r.faults.slice(0, 8).map((f) => `${f.kind} ${f.detail} ${f.url ?? ''}`).join(' / ')}`] : []),
      ]),
    ]
    writeFileSync(path.join(out, 'summary.md'), lines.join('\n') + '\n')
    console.log(`\njourneys: ${pass} PASS, ${fail} FAIL; ${path.join(out, 'summary.md')}`)
  }
}
