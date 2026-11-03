import { createHash } from 'node:crypto';

import argon2 from 'argon2';

/**
 * argon2id. Tests use a much cheaper cost, like Laravel's BCRYPT_ROUNDS=4.
 */
const hashOptions: argon2.HashOptions & { raw?: false } =
    process.env.NODE_ENV === 'test'
        ? {
              type: argon2.argon2id,
              memoryCost: 1024,
              timeCost: 1,
              parallelism: 1,
          }
        : { type: argon2.argon2id };

export function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, hashOptions);
}

export async function verifyPassword(
    hash: string,
    password: string,
): Promise<boolean> {
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}

/** Checks a password against a breach corpus; true when it has been leaked. */
export type PwnedChecker = (password: string) => Promise<boolean>;

/**
 * Have I Been Pwned range API (k-anonymity: only the first 5 hex chars of the
 * SHA-1 are sent). Fails open like Laravel's NotPwnedVerifier.
 */
export const hibpChecker: PwnedChecker = async (password) => {
    const sha1 = createHash('sha1')
        .update(password)
        .digest('hex')
        .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
        const response = await fetch(
            `https://api.pwnedpasswords.com/range/${prefix}`,
            {
                headers: { 'Add-Padding': 'true', 'User-Agent': 'Hisaab' },
                signal: AbortSignal.timeout(3_000),
            },
        );

        if (!response.ok) return false;

        const body = await response.text();

        return body.split('\n').some((line) => {
            const [hashSuffix, count] = line.trim().split(':');
            return hashSuffix === suffix && Number(count) > 0;
        });
    } catch {
        return false;
    }
};

export type PasswordPolicy = {
    /** Laravel's production rules: 12+, mixed case, letters, numbers, symbols, not leaked. */
    strict: boolean;
    pwned: PwnedChecker;
};

/** Returns the first failing rule's message (Laravel wording), or null. */
export async function checkPasswordStrength(
    password: string,
    policy: PasswordPolicy,
): Promise<string | null> {
    const min = policy.strict ? 12 : 8;

    // Code points, like PHP's mb_strlen (Laravel's min rule).
    if (Array.from(password).length < min) {
        return `The password field must be at least ${min} characters.`;
    }

    if (!policy.strict) return null;

    if (!/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password)) {
        return 'The password field must contain at least one uppercase and one lowercase letter.';
    }
    if (!/\p{L}/u.test(password)) {
        return 'The password field must contain at least one letter.';
    }
    if (!/\p{N}/u.test(password)) {
        return 'The password field must contain at least one number.';
    }
    if (!/[\p{Z}\p{S}\p{P}]/u.test(password)) {
        return 'The password field must contain at least one symbol.';
    }
    if (await policy.pwned(password)) {
        return 'The given password has appeared in a data leak. Please choose a different password.';
    }

    return null;
}

/** For the HTML `passwordrules` attribute (same as Laravel's toPasswordRulesString). */
export function passwordRulesString(
    policy: Pick<PasswordPolicy, 'strict'>,
): string {
    return policy.strict
        ? 'minlength: 12; required: lower; required: upper; required: digit; required: special;'
        : 'minlength: 8;';
}
