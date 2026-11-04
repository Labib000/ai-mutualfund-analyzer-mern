import { afterEach, describe, expect, it } from 'vitest';

import { AiQuota } from '../../src/ai/aiQuota.js';
import {
    AiQuotaExceededError,
    AiUnavailableError,
} from '../../src/ai/provider.js';
import { RunAiFeature } from '../../src/ai/runAiFeature.js';
import { setTestNow } from '../../src/lib/today.js';
import { AiUsage } from '../../src/models/aiUsage.js';
import { createUser } from '../support/app.js';
import { useTestDb } from '../support/db.js';
import { FakeAiProvider } from '../support/fakeAiProvider.js';

const request = {
    system: 'S',
    messages: [{ role: 'user' as const, content: 'Q' }],
    maxOutputTokens: 500,
};

describe('RunAiFeature and AiQuota', () => {
    useTestDb();
    afterEach(() => setTestNow(null));

    it('logs successful and failed calls; only successes use the quota', async () => {
        const user = await createUser();
        const provider = new FakeAiProvider();
        const run = new RunAiFeature(provider, new AiQuota(20), 'model-x');

        const response = await run.handle(user._id, 'summary', request);
        expect(response.text).toBe(provider.answer);

        provider.failing = true;
        await expect(
            run.handle(user._id, 'ask', request),
        ).rejects.toBeInstanceOf(AiUnavailableError);

        const rows = await AiUsage.find({ userId: user._id })
            .sort({ createdAt: 1, _id: 1 })
            .lean();
        expect(
            rows.map((r) => [
                r.feature,
                r.provider,
                r.model,
                r.inputTokens,
                r.outputTokens,
                r.succeeded,
            ]),
        ).toEqual([
            ['summary', 'fake', 'fake-model', 1200, 300, true],
            ['ask', 'fake', 'model-x', 0, 0, false],
        ]);
        expect(await run.quota.remaining(user._id)).toBe(19);
    });

    it('blocks requests once the month is used up, until the next IST month', async () => {
        const user = await createUser();
        const provider = new FakeAiProvider();
        const run = new RunAiFeature(provider, new AiQuota(2), 'model-x');

        // 31 Oct, 23:00 IST.
        setTestNow('2026-10-31T23:00:00+05:30');
        await run.handle(user._id, 'ask', request);
        await run.handle(user._id, 'ask', request);
        await expect(run.handle(user._id, 'ask', request)).rejects.toThrow(
            "You've used all 2 AI requests for this month. They reset on the 1st.",
        );
        await expect(
            run.handle(user._id, 'ask', request),
        ).rejects.toBeInstanceOf(AiQuotaExceededError);
        expect(provider.requests).toHaveLength(2);

        // 1 Nov, 00:30 IST is still 31 Oct in UTC, but a new month in India.
        setTestNow('2026-11-01T00:30:00+05:30');
        expect(await run.quota.remaining(user._id)).toBe(2);
        await run.handle(user._id, 'ask', request);
        expect(provider.requests).toHaveLength(3);
    });
});
