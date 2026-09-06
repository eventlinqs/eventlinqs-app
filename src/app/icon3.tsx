import { renderOgResponse, OG_DISPLAY_FAMILY } from '@/lib/broadcast/og-response'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

const NAVY = '#0A1628'
const GOLD = '#D4A017'

// Maskable (Android adaptive) app icon. Full-bleed navy with NO rounded corners -
// the OS applies the mask shape (circle / squircle / rounded square) itself - and
// the "E." mark is kept inside the central safe zone (fontSize 240 of 512, ~47%)
// so it is never clipped by any mask. Referenced from manifest.ts with
// purpose: 'maskable' so the installed PWA icon renders correctly on Android.
export default function IconMaskable() {
  return renderOgResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
          fontFamily: OG_DISPLAY_FAMILY,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            color: 'white',
            fontSize: 240,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          E
          <span style={{ color: GOLD, marginLeft: '0.04em' }}>.</span>
        </div>
      </div>
    ),
    { ...size, where: 'app/icon3' }
  )
}
