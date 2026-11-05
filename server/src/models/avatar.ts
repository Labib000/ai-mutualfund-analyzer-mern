import { type InferSchemaType, Schema, Types, model } from 'mongoose';

/**
 * A user's profile photo: a small JPEG, cropped in the browser. Kept apart
 * from the user document, which is loaded on every request. In the database
 * because the host's disk doesn't survive a redeploy.
 */
const avatarSchema = new Schema(
    {
        userId: {
            type: Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        data: { type: Buffer, required: true },
    },
    { timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);

export type AvatarFields = InferSchemaType<typeof avatarSchema>;

export const Avatar = model('Avatar', avatarSchema, 'avatars');
