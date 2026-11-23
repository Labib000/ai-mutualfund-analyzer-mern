import type { User as UserJson } from '@hisaab/shared';
import {
    type HydratedDocument,
    type InferSchemaType,
    type MongooseQueryMiddleware,
    type Query,
    Schema,
    model,
} from 'mongoose';

import { forgetCachedUsers, userCacheEnabled } from '../lib/userCache.js';

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

/*
 * Every write to a user clears its cached copy (lib/userCache.ts). The hooks
 * live on the schema, not in the routes, so no current or future write path
 * can forget to clear it.
 */
userSchema.post('save', async function (doc) {
    await forgetCachedUsers([doc.id as string]);
});
userSchema.post(
    'deleteOne',
    { document: true, query: false },
    async function (doc) {
        await forgetCachedUsers([doc.id as string]);
    },
);

/** Query writes don't say which users they touch: look them up first. */
const QUERY_WRITES: MongooseQueryMiddleware[] = [
    'updateOne',
    'updateMany',
    'replaceOne',
    'findOneAndUpdate',
    'findOneAndReplace',
    'findOneAndDelete',
    'deleteOne',
    'deleteMany',
];
const touchedUserIds = new WeakMap<object, string[]>();

userSchema.pre(
    QUERY_WRITES,
    { document: false, query: true },
    async function (this: Query<unknown, unknown>) {
        if (!userCacheEnabled()) return;
        const docs = await this.model
            .find(this.getFilter(), { _id: 1 })
            .session(this.getOptions().session ?? null)
            .lean<{ _id: unknown }[]>();
        touchedUserIds.set(
            this,
            docs.map((d) => String(d._id)),
        );
    },
);
userSchema.post(
    QUERY_WRITES,
    { document: false, query: true },
    async function (this: Query<unknown, unknown>) {
        const ids = touchedUserIds.get(this);
        if (ids) await forgetCachedUsers(ids);
    },
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
