'use client'

import { useState } from 'react'
import type { AuditLogRow } from '@/lib/admin/types'

/**
 * Inline JSON-detail toggle for an audit row.
 *
 * No drawer in A1 - clicking opens a small overlay anchored to the row
 * with the metadata payload pretty-printed. Closing returns focus to the
 * trigger.
 */
export function AuditDetailButton({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
      >
        View
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-white/[0.08] bg-[#131A2A] p-6"
            onClick={e => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Audit entry</p>
                <h2 className="mt-1 font-display text-xl font-bold tracking-tight">#{row.id}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
              >
                Close
              </button>
            </header>
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field k="When" v={new Date(row.created_at).toISOString()} />
              <Field k="Actor" v={row.actor_email_snapshot ?? 'anonymous'} />
              <Field k="Role" v={row.actor_role_snapshot ?? '-'} />
              <Field k="Action" v={row.action} />
              <Field k="Target type" v={row.target_type ?? '-'} />
              <Field k="Target id" v={row.target_id ?? '-'} />
              <Field k="IP" v={row.ip ?? '-'} />
              <Field k="User agent" v={row.user_agent ?? '-'} />
            </dl>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white/50">Metadata</p>
              <pre className="max-h-[40vh] overflow-auto rounded-md border border-white/10 bg-black/40 p-3 font-mono text-xs text-white/80">
                {JSON.stringify(row.metadata ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[11px] uppercase tracking-[0.18em] text-white/50">{k}</dt>
      <dd className="break-all font-mono text-xs text-white/80">{v}</dd>
    </>
  )
}
