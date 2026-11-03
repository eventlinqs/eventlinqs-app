/**
 * EVERY COPY BUTTON COPIES (the CONTROLLER's 14:10 of 3 November 2026: 'everything a user will press should work'). The
 * every-tap drive found 'Copy link' and 'Copy the link for Instagram' doing nothing where the browser refuses the async
 * clipboard (as in-app browsers such as Instagram's often do, and as a headless one does): the catch said 'the user can
 * long-press the address bar', and the tap was dead. Here: the clipboard first, then the browser's own copy command on a
 * selected, unseen field; it rejects only when both refuse, so every caller keeps its own success and failure paths.
 * The ONE place that writes to the clipboard: tests/unit/share/one-copy-door.test.ts fails any other.
 */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (error) {
      // Refused (no permission, an in-app browser, no focus): the copy command below is the second way, said here.
      if (!legacyCopy(text)) throw error instanceof Error ? error : new Error('the browser refused to copy')
      return
    }
  }
  if (!legacyCopy(text)) throw new Error('the browser refused to copy')
}

/** The browser's own copy command on a selected field nobody sees; true when the browser says it copied. */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch (error) {
    console.warn('[copy-text] the copy command was refused:', error instanceof Error ? error.message : error)
    copied = false
  }
  document.body.removeChild(area)
  return copied
}
