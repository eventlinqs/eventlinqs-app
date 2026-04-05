'use client'

export function CopyLinkButton() {
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(window.location.href)}
      className="text-sm text-blue-600 hover:underline"
    >
      Copy link
    </button>
  )
}
