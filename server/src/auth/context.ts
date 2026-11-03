import type { Config } from '../config.js';
import type { Logger } from '../lib/logger.js';
import type { Mailer } from '../mail/mailer.js';
import type { PasswordPolicy } from './password.js';
import type { UrlSigner } from './signedUrl.js';

/** Services the auth routes need; injected so tests can swap them. */
export type AuthContext = {
    config: Config;
    logger: Logger;
    mailer: Mailer;
    signer: UrlSigner;
    passwordPolicy: PasswordPolicy;
};
