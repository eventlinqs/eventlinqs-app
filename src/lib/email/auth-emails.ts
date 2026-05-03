import { sendEmail } from './send'

// The HTML body below mirrors src/lib/email/templates/auth/confirm-signup.html
// with the `{{ .ConfirmationURL }}` Supabase placeholder replaced by a runtime
// substitution. The .html file remains the single design source for the
// Supabase Dashboard paste-target; this string is the bundled runtime form
// because Next.js does not natively load .html as a module string and reading
// from `process.cwd()` is not reliable in serverless Lambda packaging.
//
// When the template changes, update both files. They are short and the
// duplication is contained to this helper, so the maintenance cost is small
// versus the deploy reliability gained.
function confirmSignupHtml(confirmationUrl: string): string {
  const safeUrl = escapeHtmlAttribute(confirmationUrl)
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Confirm your EventLinqs email</title>
  </head>
  <body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A2E;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAFA;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(26,26,46,0.06);">
            <tr>
              <td style="padding:32px 40px 24px;border-bottom:1px solid #F0F0F2;">
                <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.04em;color:#1A1A2E;">EVENTLINQS</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 24px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:#1A1A2E;">Confirm your email</h1>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#1A1A2E;">
                  Welcome to EventLinqs. Tap the button below to confirm your email and finish setting up your account.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td>
                      <a href="${safeUrl}"
                         style="display:inline-block;padding:14px 28px;background-color:#1A1A2E;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
                        Confirm email
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#6B7280;">
                  Or paste this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.55;color:#4A90D9;word-break:break-all;">
                  <a href="${safeUrl}" style="color:#4A90D9;text-decoration:underline;">${safeUrl}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.55;color:#6B7280;">
                  If you did not create an EventLinqs account, you can safely ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px;border-top:1px solid #F0F0F2;background-color:#FAFAFA;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#6B7280;">
                  Every culture. Every event. One platform.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.55;color:#6B7280;">
                  EventLinqs, Geelong, Australia. Need help? Email <a href="mailto:hello@eventlinqs.com" style="color:#4A90D9;text-decoration:underline;">hello@eventlinqs.com</a>.
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

function confirmSignupText(confirmationUrl: string): string {
  return [
    'Confirm your EventLinqs email',
    '',
    'Welcome to EventLinqs. Open this link to confirm your email and finish setting up your account:',
    confirmationUrl,
    '',
    'If you did not create an EventLinqs account, you can safely ignore this email.',
    '',
    'EventLinqs, Geelong, Australia',
    'hello@eventlinqs.com',
  ].join('\n')
}

// Belt-and-braces escape for URLs interpolated into href attributes. Supabase
// returns trustworthy URLs, but rendering user-influenced data into HTML
// without escaping is the kind of habit that turns a future template tweak
// into an XSS hole. Exported for direct testing.
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function sendSignupConfirmation(input: {
  to: string
  confirmationUrl: string
}): Promise<{ id: string }> {
  return sendEmail({
    to: input.to,
    subject: 'Confirm your EventLinqs email',
    html: confirmSignupHtml(input.confirmationUrl),
    text: confirmSignupText(input.confirmationUrl),
  })
}
