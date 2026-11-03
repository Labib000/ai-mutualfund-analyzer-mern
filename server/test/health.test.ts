import { healthResponseSchema } from '@hisaab/shared';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { connectDb } from '../src/db.js';
import { setTestNow } from '../src/lib/today.js';
import { makeTestApp } from './support/app.js';
import { testDbUri, useTestDb } from './support/db.js';

describe('GET /api/health', () => {
    useTestDb();
    afterEach(() => setTestNow(null));

    it('reports ok when MongoDB answers', async () => {
        setTestNow('2026-10-08T12:00:00+05:30');

        const res = await request(makeTestApp()).get('/api/health').expect(200);

        expect(healthResponseSchema.parse(res.body)).toEqual({
            status: 'ok',
            db: 'up',
            today: '2026-10-08',
            time: '2026-10-08T06:30:00.000Z',
        });
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('reads and writes through the connection', async () => {
        const coll = mongoose.connection.collection('healthcheck');
        await coll.insertOne({ ok: true });

        expect(await coll.countDocuments()).toBe(1);
    });

    it('supports transactions (replica set)', async () => {
        const coll = mongoose.connection.collection('txn');
        await coll.insertOne({ seed: true });

        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
            await coll.insertOne({ inTxn: true }, { session });
        });
        await session.endSession();

        expect(await coll.countDocuments({ inTxn: true })).toBe(1);
    });

    it('reports 503 when MongoDB is down', async () => {
        await mongoose.disconnect();

        try {
            const res = await request(makeTestApp())
                .get('/api/health')
                .expect(503);

            expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
        } finally {
            await connectDb(testDbUri());
        }
    });
});

describe('API basics', () => {
    it('returns JSON 404 for unknown API routes', async () => {
        const res = await request(makeTestApp()).get('/api/nope').expect(404);

        expect(res.body).toEqual({ message: 'Not found.' });
    });

    it('rejects malformed JSON with 400, not 500', async () => {
        await request(makeTestApp())
            .post('/api/health')
            .set('Content-Type', 'application/json')
            .send('{bad json')
            .expect(400);
    });

    it('sets security headers and hides Express', async () => {
        const res = await request(makeTestApp()).get('/api/nope');

        expect(res.headers['x-powered-by']).toBeUndefined();
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
});
