import { Schema, model } from 'mongoose';

/** Reset tokens expire after this many minutes (Laravel: auth.passwords.users.expire). */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** One live token per email; only its SHA-256 hash is stored. */
const passwordResetTokenSchema = new Schema({
    email: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    createdAt: {
        type: Date,
        required: true,
        // Mongo's TTL monitor removes expired tokens (within ~60s).
        expires: RESET_TOKEN_TTL_MINUTES * 60,
    },
});

export const PasswordResetToken = model(
    'PasswordResetToken',
    passwordResetTokenSchema,
    'passwordResetTokens',
);
