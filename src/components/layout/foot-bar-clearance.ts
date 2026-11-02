'use client'

import { useEffect } from 'react'

/**
 * THE FOOT BAR'S CLEARANCE (round 2, item 8: 'Confirm the bottom navigation never covers content', Lawal, 2 November
 * 2026, 12:05). The mobile nav is 64px and the page reserves exactly that (MainContentFrame; the footer's -mb-16 pb-16).
 * A page's own bar ABOVE the nav (fixed bottom-16, the venue, organiser and city bars) is 60px more, and at the foot of
 * the page it sat over the footer's last row. While such a bar is mounted it writes its height here; the footer adds it
 * under its last row on a phone (site-footer.tsx), so the last row clears both bars. Set on mount, not on scroll: the
 * reservation only lengthens the document below everything, so nothing on screen moves.
 */
export const FOOT_BAR_VAR = '--el-foot-bar'

export function useFootBarClearance(px: number): void {
  useEffect(() => {
    const style = document.documentElement.style
    style.setProperty(FOOT_BAR_VAR, `${px}px`)
    return () => {
      style.removeProperty(FOOT_BAR_VAR)
    }
  }, [px])
}
