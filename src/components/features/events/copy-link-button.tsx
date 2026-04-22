'use client'

export function CopyLinkButton() {
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(window.location.href)}
      className="text-sm font-semibold text-gold-700 transition-colors hover:text-ink-900 hover:underline"
    >
      Copy link
    </button>
  )
}
