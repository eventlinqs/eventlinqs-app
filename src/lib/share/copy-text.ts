/**
 * EVERY COPY BUTTON COPIES (the CONTROLLER's 14:10 of 3 November 2026: 'everything a user will press should work'). The
 * every-tap drive found 'Copy link' and 'Copy the link for Instagram' doing nothing where the browser refuses the async
 * clipboard (as in-app browsers such as Instagram's often do): the tap was dead. Here: the clipboard first, then the
 * browser's own copy command on a selected, unseen field; it rejects only when both refuse, so every caller keeps its own
 * success and failure paths. The ONE place that writes to the clipboard: tests/unit/share/one-copy-door.test.ts.
 *
 * KEPT SMALL ON PURPOSE: it rides in every event page's first load (car 40's production build stopped on the Scope v5
 * 10.3 budget of 200.0 KB with the event routes at 200.0 and 200.1 KB), so no message strings, no extra attributes.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch (refused) {
    // The clipboard said no (an in-app browser, no permission, no clipboard at all): the copy command is the second way.
    if (!legacyCopy(text)) throw refused
  }
}

/** The browser's own copy command on a selected field nobody sees; true when the browser says it copied. */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.style.cssText = 'position:fixed;top:0;opacity:0'
  document.body.append(area)
  area.select()
  let copied: boolean
  try {
    copied = document.execCommand('copy')
  } catch {
    // The command itself threw (an old browser): not copied, so the caller's own failure path runs.
    copied = false
  }
  area.remove()
  return copied
}
