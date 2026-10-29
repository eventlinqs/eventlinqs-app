/**
 * THE WEEKLY SOCIAL REPORT, DRAWN FROM TEST WITHOUT A SERVER (J16, J17). Reads a campaign's report through the real
 * reader (src/lib/growth/social-report.ts) and renders the real view (report-view.tsx) to static HTML, so the report
 * can be opened and read while no dev server may run. The presses are inert here.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-report-render.mts <campaign id> <out.html>
 */
import Module from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as ReportModule from '@/lib/growth/social-report'
import type * as ViewModule from '@/app/admin/(authed)/growth/social-report/report-view'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const rmod = (await import('@/lib/growth/social-report')) as typeof ReportModule & { default?: typeof ReportModule }
const vmod = (await import('@/app/admin/(authed)/growth/social-report/report-view')) as typeof ViewModule & { default?: typeof ViewModule }
const { readSocialReport } = rmod.default ?? rmod
const { SocialReportView } = vmod.default ?? vmod

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-report-render runs on TEST only')
  process.exit(2)
}
const [campaignId, out] = process.argv.slice(2)
if (!campaignId || !out) {
  console.error('usage: social-report-render.mts <campaign id> <out.html>')
  process.exit(2)
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
const page = await readSocialReport(db, { campaignId, now: new Date() })
const inert = async () => {}
const body = renderToStaticMarkup(createElement(SocialReportView, { page, said: null, readAtDefault: '2026-10-28T15:30', enterFigure: inert, decide: inert }))
const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Weekly social report (TEST render)</title>
<style>body{margin:0;padding:16px;background:#0A1628;color:#fff;font:14px/1.5 system-ui,sans-serif}section{border:1px solid #ffffff22;border-radius:12px;padding:16px;margin:0 0 16px;background:#131A2A}a{color:#E8B738}table{border-collapse:collapse}td,th{padding:4px 12px 4px 0;text-align:left}li{margin:4px 0}button,select,input{min-height:44px;margin:2px}form{display:flex;flex-wrap:wrap;gap:6px;align-items:end}dl div{margin:2px 0}</style>
</head><body>${body}</body></html>`
writeFileSync(out, html)
console.log(`RENDERED ${out}: ${page.report?.pieces.length ?? 0} pieces, baseline ${page.report?.baseline === null ? 'none' : page.report?.baseline?.campaigns}, ${page.report?.recommendations.length ?? 0} recommendations, ${page.decisions.length} decisions`)
