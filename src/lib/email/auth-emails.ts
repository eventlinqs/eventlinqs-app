import { sendEmail } from './send'
import { getReplyToAddress } from './sender'

/**
 * Every auth email EventLinqs sends, on ONE transport.
 *
 * All four auth mails (confirm signup, password reset, magic link, resend
 * verification) are built here and dispatched through the Resend SDK. None of
 * them touch Supabase Auth's outbound mailer.
 *
 * Why that matters, and why the other three were moved here on 2026-08-03:
 * Supabase's built-in mailer is capped at TWO emails per hour, project-wide
 * (supabase.com/docs/guides/auth/rate-limits). Signup was lifted off it in May
 * 2026, but password reset, magic link and resend-verification were parked as
 * follow-ups and left behind. The founder hit the cap on 2026-08-02 and the
 * forgot-password form answered "Error sending recovery email".
 *
 * Configuring custom SMTP in the Supabase dashboard would raise the cap, but it
 * would leave the platform's mail depending on a toggle no code can enforce and
 * no gate can see. Owning the transport outright is the permanent fix:
 * `scripts/guards/no-supabase-smtp.mjs` now fails the build if any auth flow
 * reaches for Supabase's mailer again.
 *
 * The HTML mirrors src/lib/email/templates/auth/confirm-signup.html. Emails
 * need literal hexes: #0A1628 is brand navy (--color-ink-900) for body text,
 * headings, links and the button; #6B7280 is --color-ink-400 muted text.
 */

type AuthEmailContent = {
  /** Browser tab / preview title. */
  title: string
  /** The h1 inside the card. */
  heading: string
  /** Lead paragraph above the button. */
  lead: string
  /** Button label. */
  cta: string
  /** Closing reassurance for someone who did not ask for this email. */
  disclaimer: string
}

/**
 * Belt-and-braces escape for URLs interpolated into href attributes. Supabase
 * returns trustworthy URLs, but rendering user-influenced data into HTML
 * without escaping is the kind of habit that turns a future template tweak
 * into an XSS hole. Exported for direct testing.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** The shared branded shell. One design, four messages. */
function authEmailHtml(content: AuthEmailContent, actionUrl: string): string {
  const safeUrl = escapeHtmlAttribute(actionUrl)
  const contact = getReplyToAddress()
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${content.title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0A1628;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAFA;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(10,22,40,0.06);">
            <tr>
              <td style="padding:32px 40px 24px;border-bottom:1px solid #F0F0F2;">
                <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.04em;color:#0A1628;">EVENTLINQS</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 24px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:#0A1628;">${content.heading}</h1>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#0A1628;">
                  ${content.lead}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td>
                      <a href="${safeUrl}"
                         style="display:inline-block;padding:14px 28px;background-color:#0A1628;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
                        ${content.cta}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#6B7280;">
                  Or paste this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.55;color:#0A1628;word-break:break-all;">
                  <a href="${safeUrl}" style="color:#0A1628;text-decoration:underline;">${safeUrl}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.55;color:#6B7280;">
                  ${content.disclaimer}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px;border-top:1px solid #F0F0F2;background-color:#FAFAFA;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#6B7280;">
                  Every community. Every event. One platform.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.55;color:#6B7280;">
                  EventLinqs, Geelong, Australia. Need help? Email <a href="mailto:${contact}" style="color:#0A1628;text-decoration:underline;">${contact}</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Plain-text alternative. Hand-tuned rather than derived: it lifts deliverability. */
function authEmailText(content: AuthEmailContent, actionUrl: string): string {
  return [
    content.title,
    '',
    `${content.lead.replace(/\s+/g, ' ').trim()}`,
    actionUrl,
    '',
    content.disclaimer,
    '',
    'EventLinqs, Geelong, Australia',
    getReplyToAddress(),
  ].join('\n')
}

const CONFIRM_SIGNUP: AuthEmailContent = {
  title: 'Confirm your EventLinqs email',
  heading: 'Confirm your email',
  lead: 'Welcome to EventLinqs. Tap the button below to confirm your email and finish setting up your account.',
  cta: 'Confirm email',
  disclaimer: 'If you did not create an EventLinqs account, you can safely ignore this email.',
}

const RESET_PASSWORD: AuthEmailContent = {
  title: 'Reset your EventLinqs password',
  heading: 'Reset your password',
  lead: 'We received a request to reset the password on your EventLinqs account. Tap the button below to choose a new one. The link works once and expires in 24 hours.',
  cta: 'Choose a new password',
  disclaimer:
    'If you did not ask to reset your password, you can safely ignore this email. Your current password stays active.',
}

const MAGIC_LINK: AuthEmailContent = {
  title: 'Your EventLinqs sign-in link',
  heading: 'Sign in to EventLinqs',
  lead: 'Tap the button below to sign in. No password needed. The link works once and expires in 24 hours.',
  cta: 'Sign in to EventLinqs',
  disclaimer: 'If you did not ask to sign in, you can safely ignore this email.',
}

export async function sendSignupConfirmation(input: {
  to: string
  confirmationUrl: string
}): Promise<{ id: string }> {
  return sendEmail({
    to: input.to,
    subject: CONFIRM_SIGNUP.title,
    html: authEmailHtml(CONFIRM_SIGNUP, input.confirmationUrl),
    text: authEmailText(CONFIRM_SIGNUP, input.confirmationUrl),
  })
}

export async function sendPasswordReset(input: {
  to: string
  resetUrl: string
}): Promise<{ id: string }> {
  return sendEmail({
    to: input.to,
    subject: RESET_PASSWORD.title,
    html: authEmailHtml(RESET_PASSWORD, input.resetUrl),
    text: authEmailText(RESET_PASSWORD, input.resetUrl),
  })
}

export async function sendMagicLink(input: {
  to: string
  signInUrl: string
}): Promise<{ id: string }> {
  return sendEmail({
    to: input.to,
    subject: MAGIC_LINK.title,
    html: authEmailHtml(MAGIC_LINK, input.signInUrl),
    text: authEmailText(MAGIC_LINK, input.signInUrl),
  })
}

/** Exposed so tests can assert the shell without going through a transport. */
export const __authEmailTemplates = {
  CONFIRM_SIGNUP,
  RESET_PASSWORD,
  MAGIC_LINK,
  authEmailHtml,
  authEmailText,
}
