import type { MailMessage } from './mailer.js';

const BRAND = '#0E9384';

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/** A simple branded email: greeting, lines, one button, closing note. */
function layout(opts: {
    name: string;
    intro: string[];
    action: { label: string; url: string };
    outro: string[];
}): { html: string; text: string } {
    const p = (line: string) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(line)}</p>`;

    const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f8f8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px">
<tr><td style="padding:28px 32px 8px;font-size:20px;font-weight:600;color:#0b2b27">Hisaab</td></tr>
<tr><td style="padding:8px 32px 24px">
${p(`Hello ${opts.name},`)}
${opts.intro.map(p).join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(opts.action.label)}</a></p>
${opts.outro.map(p).join('\n')}
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(opts.action.url)}" style="color:${BRAND};word-break:break-all">${escapeHtml(opts.action.url)}</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`;

    const text = [
        `Hello ${opts.name},`,
        '',
        ...opts.intro,
        '',
        `${opts.action.label}: ${opts.action.url}`,
        '',
        ...opts.outro,
    ].join('\n');

    return { html, text };
}

export function verifyEmailMessage(
    to: string,
    name: string,
    url: string,
): MailMessage {
    return {
        to,
        subject: 'Verify your email address',
        ...layout({
            name,
            intro: [
                'Please click the button below to verify your email address.',
            ],
            action: { label: 'Verify email address', url },
            outro: [
                'This link expires in 60 minutes.',
                'If you did not create an account, no further action is required.',
            ],
        }),
    };
}

export function resetPasswordMessage(
    to: string,
    name: string,
    url: string,
): MailMessage {
    return {
        to,
        subject: 'Reset your password',
        ...layout({
            name,
            intro: [
                'You are receiving this email because we received a password reset request for your account.',
            ],
            action: { label: 'Reset password', url },
            outro: [
                'This password reset link will expire in 60 minutes.',
                'If you did not request a password reset, no further action is required.',
            ],
        }),
    };
}
