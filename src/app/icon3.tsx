import { ImageResponse } from 'next/og'

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
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
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
    { ...size }
  )
}
