import { redirect } from 'next/navigation'
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
 * The shared secret is rendered as text plus an otpauth:// URI. QR
 * rendering is intentionally not in A1 - copy and paste into the
 * authenticator works on every modern app.
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
          Open your authenticator and scan the QR code from your password manager, or paste the URI
          below. If your app does not accept the URI, type the base32 secret manually.
        </p>
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
