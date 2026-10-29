/**
 * /admin/acquisition RENDERED ON TEST's REAL ROWS (window 6, 30 October 2026). The page component itself, rendered to
 * HTML with TEST's service client; only the admin session and the audit write are stood in for, because looking at the
 * page in a browser needs the founder's own login with his 2FA code (the surface-proof skill's one human step). Checks
 * that every organiser is a row, every row carries a state in words, the score parts and the cohort column, and the
 * summary counts match TEST's own counts. Writes nothing. TEST only (constant ref).
 *
 *   powershell -File scripts/ops/with-supabase-token.ps1 npx vitest run --config vitest.proof.config.ts tests/proofs/acquisition-page.proof.tsx
 */
import { writeFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const REF = 'vkapkibzokmfaxqogypq'
const token = process.env.SUPABASE_ACCESS_TOKEN
const h = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('@/lib/admin/auth', () => ({ requireAdminSession: async () => ({ userId: 'proof', role: 'founder' }) }))
vi.mock('@/lib/admin/rbac', () => ({ can: () => true }))
vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: async () => undefined }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirected') } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))

async function query(sql: string): Promise<Record<string, number>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: true }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

it('renders every TEST organiser with its state, its score parts and its cohort line', async () => {
  if (!token) throw new Error('run through scripts/ops/with-supabase-token.ps1')
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { authorization: `Bearer ${token}` } })
  const keys = (await res.json()) as { name: string; type: string; api_key: string }[]
  h.client = createClient<Database>(`https://${REF}.supabase.co`, keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ?? '', { auth: { persistSession: false } })

  const { default: Page } = await import('@/app/admin/(authed)/acquisition/page')
  const html = renderToStaticMarkup(await Page())
  writeFileSync('C:/dev/EVIDENCE/W6-30OCT/admin-acquisition-TEST.html', html)

  const [{ organisers }] = await query('select count(*)::int as organisers from public.organisers')
  const rowsRendered = (html.match(/<tr class="border-t/g) ?? []).length
  expect(rowsRendered).toBe(organisers)
  expect(html).toContain('Organiser pipeline')
  expect(html).not.toContain('Not yet read')
  const states = await query('select acquisition_state as s, count(*)::int as n from public.organisers group by 1')
  for (const { s, n } of states as unknown as { s: string; n: number }[]) {
    const words = (await import('@/lib/outreach/acquisition-states')).STATE_WORDS[s as 'discovered']
    expect(html).toContain(`<span class="font-semibold text-white">${n}</span> ${words.replace(/&/g, '&amp;')}`)
  }
  expect(html).toMatch(/of 100 picked/)
  console.log(`rendered ${rowsRendered} organiser rows of ${organisers}; states ${JSON.stringify(states)}; ${html.length} characters of HTML`)
})
