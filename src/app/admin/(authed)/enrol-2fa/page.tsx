import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { requireAdminSession } from '@/lib/admin/auth'
import { prepareTotpEnrolmentAction } from '../../actions'
import { EnrolForm } from './enrol-form'

export const metadata = {
  title: 'Enrol 2FA | EventLinqs Admin',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * One-time 2FA enrolment.
 *
 * Reached automatically after the first login of a fresh admin (the seeded
 * super_admin or anyone reset by another super_admin). Once enrolled, the
 * admin is redirected to /admin and this route refuses re-entry.
 *
 * THE QR CODE, ADDED 11 September 2026, and the reason is what this page used
 * to say rather than a preference. Its own copy read "scan the QR code from
 * your password manager", and this page drew nothing to scan: the header
 * carried the sentence "QR rendering is intentionally not in A1 - copy and
 * paste into the authenticator works on every modern app", which is only true
 * of somebody enrolling on the same machine they are reading this on. An
 * authenticator lives on a PHONE. What that instruction actually asked for was
 * a person typing a 32 character base32 secret off a laptop screen into a
 * handset, on the one screen where a typo locks them out of the admin console.
 *
 * It costs nothing to fix: `qrcode` is already a dependency and already renders
 * server-side for the door ticket at `/t/[code]`, so this is an inline SVG
 * composed on the server. No new dependency, no client JavaScript, and the
 * secret never leaves the response it was already in.
 *
 * The secret and the URI stay, because an authenticator that cannot use a
 * camera still needs them, and because a person who cannot scan must never be
 * left with only a picture.
 */
export default async function EnrolTwoFactorPage() {
  const session = await requireAdminSession()
  if (session.admin.totp_secret_encrypted) {
    redirect('/admin')
  }

  const prep = await prepareTotpEnrolmentAction()
  if (!prep.ok || !prep.secretBase32 || !prep.otpauthUri || !prep.enrolToken) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">
        {prep.error ?? 'Could not start enrolment. Refresh and try again.'}
      </div>
    )
  }

  /*
   * AN SVG, NOT AN `<img>`, which is the shape this platform already uses for
   * the QR that gets a ticket holder through a door (`/t/[code]`). It keeps the
   * media rules satisfied without an exemption, it needs no optimiser, and a
   * one-time secret is never routed through a CDN that might cache it.
   *
   * A FAILED RENDER IS NOT A FAILED ENROLMENT. If the QR cannot be drawn the
   * page still shows the secret and the URI, which is exactly what it showed
   * before today, so nobody is locked out by a picture.
   */
  let qrSvg: string | null = null
  try {
    qrSvg = await QRCode.toString(prep.otpauthUri, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#0A1628', light: '#FFFFFF' },
    })
  } catch (cause) {
    console.error('[admin/enrol-2fa] the enrolment QR could not be drawn:', cause)
  }

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Two-factor</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">Enrol your authenticator</h1>
        <p className="mt-2 text-sm text-white/60">
          Add a 30-second code from Google Authenticator, 1Password, Authy, or Bitwarden. You will use
          this for every sign in.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-sm uppercase tracking-widest text-white/60">1. Add the secret</h2>
        <p className="mt-2 text-sm text-white/70">
          {qrSvg
            ? 'Open the authenticator on your phone and scan this. If you would rather not scan, paste the URI below, or type the base32 secret by hand.'
            : 'Open your authenticator and paste the URI below. If your app does not accept the URI, type the base32 secret by hand.'}
        </p>

        {qrSvg && (
          <div className="mt-5 flex justify-center">
            {/* Our own server-generated SVG QR, the same shape the door ticket
                uses: no third-party HTML and no raw <img>, so the media rules
                are satisfied without an exemption. `role="img"` plus a label
                because an inline SVG announces nothing on its own, and the
                label names what it is and never what it contains. */}
            {/* SIZED HERE, NOT LEFT TO THE SVG. `qrcode` emits a viewBox and
                NO width or height, so an SVG left to itself falls back to the
                CSS replaced-element default of 300x150 and the plate around it
                sizes to that instead of to the symbol. The box is pinned
                instead: 248px wide, less 12px of padding a side, so the symbol
                paints at 224px. That is comfortably inside the 294px this
                column has at 390 and comfortably above the size a phone
                decoder starts missing. */}
            <div
              role="img"
              aria-label="QR code carrying your one-time two-factor secret. Scan it with your authenticator app, or use the URI below."
              className="w-full max-w-[248px] rounded-lg border border-white/10 bg-white p-3 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>
        )}

        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Secret</p>
          <code className="mt-1 block break-all rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white">
            {prep.secretBase32}
          </code>
        </div>
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">otpauth URI</p>
          <code className="mt-1 block break-all rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/80">
            {prep.otpauthUri}
          </code>
        </div>
      </section>

      <EnrolForm enrolToken={prep.enrolToken} />
    </div>
  )
}
