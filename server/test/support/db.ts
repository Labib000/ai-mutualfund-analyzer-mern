import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';

import { connectDb, disconnectDb } from '../../src/db.js';

/** Builds a URI for a fresh database on the shared in-memory replica set. */
export function testDbUri(): string {
    const url = new URL(inject('mongoUri'));
    url.pathname = `/hisaab_test_${randomUUID().slice(0, 8)}`;
    return url.toString();
}

/**
 * Connects mongoose to an isolated database for this test file and empties
 * every collection before each test (like Laravel's RefreshDatabase).
 * Indexes are kept, so unique constraints still apply.
 */
export function useTestDb(): void {
    beforeAll(async () => {
        await connectDb(testDbUri());
        await Promise.all(
            Object.values(mongoose.models).map((model) => model.syncIndexes()),
        );
    });

    beforeEach(async () => {
        const db = mongoose.connection.db;
        if (!db) return;

        const collections = await db.collections();
        await Promise.all(collections.map((c) => c.deleteMany({})));
    });

    afterAll(async () => {
        if (
            mongoose.connection.readyState ===
            mongoose.ConnectionStates.connected
        ) {
            await mongoose.connection.dropDatabase();
        }
        await disconnectDb();
    });
}
