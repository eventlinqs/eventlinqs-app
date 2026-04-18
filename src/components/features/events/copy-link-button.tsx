'use client'

export function CopyLinkButton() {
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(window.location.href)}
      className="text-sm font-semibold text-gold-500 transition-colors hover:text-gold-600 hover:underline"
    >
      Copy link
    </button>
  )
}
