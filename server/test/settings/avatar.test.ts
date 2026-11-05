import { describe, expect, it } from 'vitest';

import { Avatar } from '../../src/models/avatar.js';
import { useTestDb } from '../support/db.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';
import { createForeignHolding } from '../support/portfolio.js';

const URL = '/api/settings/avatar';

/** Enough of a JPEG for the server's check: start and end markers. */
const jpeg = (size = 64, fill = 0x11) =>
    Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.alloc(size, fill),
        Buffer.from([0xff, 0xd9]),
    ]);

const upload = (client: Awaited<ReturnType<typeof loginAs>>, body: Buffer) =>
    client.put(URL).set('Content-Type', 'image/jpeg').send(body);

describe('profile photo', () => {
    useTestDb();

    it('starts with no photo', async () => {
        const { agent } = makeTestApp();
        const client = await loginAs(agent(), await createUser());

        const me = await client.get('/api/auth/me').expect(200);

        expect(me.body.user.avatarUrl).toBeNull();
        await client.get(URL).expect(404);
    });

    it('stores a photo and serves it back as a JPEG', async () => {
        const { agent } = makeTestApp();
        const client = await loginAs(agent(), await createUser());
        const photo = jpeg();

        const res = await upload(client, photo).expect(200);

        expect(res.body.user.avatarUrl).toMatch(
            /^\/api\/settings\/avatar\?v=[0-9a-f]+$/,
        );
        const image = await client.get(res.body.user.avatarUrl).expect(200);
        expect(image.headers['content-type']).toContain('image/jpeg');
        expect(image.headers['cache-control']).toContain('private');
        expect(Buffer.compare(image.body as Buffer, photo)).toBe(0);
    });

    it('replacing a photo gives a new URL and keeps one record', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const first = await upload(client, jpeg(64, 1)).expect(200);
        const second = await upload(client, jpeg(64, 2)).expect(200);

        expect(second.body.user.avatarUrl).not.toBe(first.body.user.avatarUrl);
        expect(await Avatar.countDocuments({ userId: user._id })).toBe(1);
    });

    it('removes a photo', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        await upload(client, jpeg()).expect(200);

        const res = await client.delete(URL).expect(200);

        expect(res.body.user.avatarUrl).toBeNull();
        expect(await Avatar.countDocuments({ userId: user._id })).toBe(0);
        await client.get(URL).expect(404);
    });

    it('rejects a body that is not a JPEG, whatever its type says', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        await upload(client, Buffer.from('<svg onload="x()"/>')).expect(422);

        expect(await Avatar.countDocuments({ userId: user._id })).toBe(0);
    });

    it('rejects other content types', async () => {
        const { agent } = makeTestApp();
        const client = await loginAs(agent(), await createUser());

        await client
            .put(URL)
            .set('Content-Type', 'image/svg+xml')
            .send('<svg/>')
            .expect(422);
    });

    it('rejects an oversized photo with a readable message', async () => {
        const { agent } = makeTestApp();
        const client = await loginAs(agent(), await createUser());

        const res = await upload(client, jpeg(300 * 1024)).expect(413);

        expect(res.body.message).toBe(
            'That photo is too large. Please try a smaller one.',
        );
    });

    it('needs a signed-in user', async () => {
        const { agent } = makeTestApp();

        await agent().get(URL).expect(401);
        await agent()
            .put(URL)
            .set('Content-Type', 'image/jpeg')
            .send(jpeg())
            .expect(401);
    });

    it('only ever serves your own photo', async () => {
        const { agent } = makeTestApp();
        const owner = await loginAs(agent(), await createUser());
        const stranger = await loginAs(agent(), await createUser());
        const res = await upload(owner, jpeg()).expect(200);

        await stranger.get(res.body.user.avatarUrl).expect(404);
    });

    it('goes when the account is deleted', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        await upload(client, jpeg()).expect(200);

        await client
            .delete('/api/settings/profile')
            .send({ password: 'password' })
            .expect(204);

        expect(await Avatar.countDocuments({ userId: user._id })).toBe(0);
    });
});

describe('settings summary', () => {
    useTestDb();

    it("counts only the user's own funds", async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        await createForeignHolding(user);
        await createForeignHolding();

        const res = await client.get('/api/settings/summary').expect(200);

        expect(res.body).toEqual({ fundCount: 1 });
    });
});
