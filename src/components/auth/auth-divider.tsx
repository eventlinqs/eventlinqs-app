export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-4 flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-ink-100" />
      <span className="text-xs uppercase tracking-wider text-ink-400">{label}</span>
      <div className="h-px flex-1 bg-ink-100" />
    </div>
  )
}
