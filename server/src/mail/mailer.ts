import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import nodemailer, { type Transporter } from 'nodemailer';

import type { Config } from '../config.js';
import { REPO_ROOT } from '../lib/paths.js';
import type { Logger } from '../lib/logger.js';

export type MailMessage = {
    to: string;
    subject: string;
    text: string;
    html: string;
};

export interface Mailer {
    send(message: MailMessage): Promise<void>;
}

/** Real email over any SMTP server, set by the MAIL_* env values. */
export class SmtpMailer implements Mailer {
    private readonly transport: Transporter;

    constructor(
        private readonly from: string,
        options: { host: string; port: number; user: string; pass: string },
    ) {
        this.transport = nodemailer.createTransport({
            host: options.host,
            port: options.port,
            secure: options.port === 465,
            auth: { user: options.user, pass: options.pass },
        });
    }

    async send(message: MailMessage): Promise<void> {
        await this.transport.sendMail({ from: this.from, ...message });
    }
}

/**
 * Local development without SMTP: writes each email to logs/mail.log
 * (and a line to the server log) so links can be clicked from there.
 */
export class LogMailer implements Mailer {
    constructor(
        private readonly file: string,
        private readonly logger: Logger,
    ) {}

    async send(message: MailMessage): Promise<void> {
        mkdirSync(path.dirname(this.file), { recursive: true });
        appendFileSync(
            this.file,
            [
                '='.repeat(72),
                `Date:    ${new Date().toISOString()}`,
                `To:      ${message.to}`,
                `Subject: ${message.subject}`,
                '',
                message.text,
                '',
            ].join('\n'),
        );
        this.logger.info(
            { to: message.to, subject: message.subject, file: this.file },
            'email written to mail log (SMTP not configured)',
        );
    }
}

/** Test double: keeps sent messages in memory. */
export class FakeMailer implements Mailer {
    readonly sent: MailMessage[] = [];

    async send(message: MailMessage): Promise<void> {
        this.sent.push(message);
    }

    to(email: string): MailMessage[] {
        return this.sent.filter((m) => m.to === email);
    }

    clear(): void {
        this.sent.length = 0;
    }
}

export function createMailer(config: Config, logger: Logger): Mailer {
    const { MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD } = config;

    if (MAIL_HOST && MAIL_USERNAME && MAIL_PASSWORD) {
        const fromAddress = config.MAIL_FROM_ADDRESS ?? MAIL_USERNAME;
        const fromName = config.MAIL_FROM_NAME ?? 'Hisaab';

        return new SmtpMailer(`"${fromName}" <${fromAddress}>`, {
            host: MAIL_HOST,
            port: MAIL_PORT ?? 465,
            user: MAIL_USERNAME,
            pass: MAIL_PASSWORD,
        });
    }

    if (config.NODE_ENV === 'production') {
        logger.warn('MAIL_* is not configured: emails will only be logged');
    }

    return new LogMailer(path.join(REPO_ROOT, 'logs/mail.log'), logger);
}
