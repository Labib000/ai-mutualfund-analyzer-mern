import type { User as UserJson } from '@hisaab/shared';
import {
    type HydratedDocument,
    type InferSchemaType,
    Schema,
    model,
} from 'mongoose';

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 255 },
        /** Stored lower-cased, so uniqueness is case-insensitive. */
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 255,
            unique: true,
        },
        passwordHash: { type: String, required: true },
        emailVerifiedAt: { type: Date, default: null },
        /** Changes with each new profile photo; null when there is none. */
        avatarVersion: { type: String, default: null },
    },
    { timestamps: true },
);

export type UserFields = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserFields>;

export const User = model('User', userSchema, 'users');

export function toUserJson(user: UserDoc): UserJson {
    return {
        id: user.id as string,
        name: user.name,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        avatarUrl: user.avatarVersion
            ? `/api/settings/avatar?v=${user.avatarVersion}`
            : null,
    };
}
