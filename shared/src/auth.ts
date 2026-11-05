import { z } from 'zod';

/**
 * Request schemas for auth and settings, shared by the client forms and the
 * server routes. Field names and messages follow the Laravel app.
 * Password *strength* is checked on the server only (it depends on the env
 * and calls the breached-password API).
 */

const required = (field: string) => `The ${field} field is required.`;

const requiredString = (field: string) =>
    z.string({ error: required(field) }).min(1, required(field));

export const nameField = requiredString('name')
    .trim()
    .min(1, required('name'))
    .max(255, 'The name field must not be greater than 255 characters.');

export const emailField = z
    .string({ error: required('email') })
    .trim()
    .toLowerCase()
    .min(1, required('email'))
    .max(255, 'The email field must not be greater than 255 characters.')
    .pipe(z.email('The email field must be a valid email address.'));

const passwordField = requiredString('password');

/** "on" (HTML checkbox) or a boolean → boolean. */
const checkbox = z
    .union([z.boolean(), z.literal('on'), z.literal('true')])
    .optional()
    .transform((value) => value === true || value === 'on' || value === 'true');

const confirmed = <
    T extends { password: string; password_confirmation?: string },
>(
    data: T,
) => data.password === data.password_confirmation;

const confirmedError = {
    error: 'The password field confirmation does not match.',
    path: ['password'],
};

export const registerSchema = z
    .object({
        name: nameField,
        email: emailField,
        password: passwordField,
        password_confirmation: z.string().optional(),
    })
    .refine(confirmed, confirmedError);

export const loginSchema = z.object({
    email: emailField,
    password: passwordField,
    remember: checkbox,
});

export const forgotPasswordSchema = z.object({
    email: emailField,
});

export const resetPasswordSchema = z
    .object({
        token: requiredString('token'),
        email: emailField,
        password: passwordField,
        password_confirmation: z.string().optional(),
    })
    .refine(confirmed, confirmedError);

export const profileUpdateSchema = z.object({
    name: nameField,
    email: emailField,
});

export const passwordUpdateSchema = z
    .object({
        current_password: requiredString('current password'),
        password: passwordField,
        password_confirmation: z.string().optional(),
    })
    .refine(confirmed, confirmedError);

export const deleteAccountSchema = z.object({
    password: passwordField,
});

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;
export type PasswordUpdateInput = z.input<typeof passwordUpdateSchema>;
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;

/** The signed-in user as the API returns it. */
export type User = {
    id: string;
    name: string;
    email: string;
    /** ISO timestamp, or null while unverified. */
    emailVerifiedAt: string | null;
    createdAt: string;
    /** The profile photo; the URL changes with the photo. Null when none is set. */
    avatarUrl: string | null;
};

/** GET /api/settings/summary */
export type SettingsSummaryResponse = { fundCount: number };

/** GET /api/auth/me */
export type MeResponse = {
    user: User | null;
    /** For the `passwordrules` attribute on new-password inputs. */
    passwordRules: string;
};

/** Error body for 4xx responses; 422 carries one message per field. */
export type ApiErrorBody = {
    message: string;
    errors?: Record<string, string>;
};
