import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { AmfiDownloadError, runNavImport } from '../../src/jobs/navImport.js';
import { JobLockedError, withJobLock } from '../../src/lib/jobLock.js';
import { NavHistory } from '../../src/models/navHistory.js';
import { Scheme } from '../../src/models/scheme.js';
import { AmfiNavFileError } from '../../src/nav/amfiNavFileParser.js';
import { useTestDb } from '../support/db.js';
import { hrefOf } from '../support/http.js';

// Port of tests/Feature/Nav/ImportNavsCommandTest.php
const AMFI_URL = 'https://www.amfiindia.com/spages/NAVAll.txt';
const FIXTURE_PATH = fileURLToPath(
    new URL('../fixtures/amfi/NAVAll-sample.txt', import.meta.url),
);
const fixture = readFileSync(FIXTURE_PATH, 'utf8');
const config = { AMFI_NAV_URL: AMFI_URL, AMFI_TIMEOUT_SECONDS: 5 };
const noSleep = async () => {};

/** A fetch that serves `body` with `status` and records each URL it was asked for. */
function fakeFetch(body: string | (() => string), status = 200) {
    return vi.fn(async (url: string | URL | Request) => {
        void url;
        return new Response(typeof body === 'function' ? body() : body, {
            status,
        });
    });
}

const importFixture = (contents: string) =>
    runNavImport({ config, fetch: fakeFetch(contents), sleep: noSleep });

const scheme = async (amfiCode: number) => {
    const found = await Scheme.findOne({ amfiCode });
    if (!found) throw new Error(`no scheme ${amfiCode}`);
    return found;
};

describe('nav-import job', () => {
    useTestDb();

    it('downloads and imports schemes', async () => {
        const fetch = fakeFetch(fixture);

        const result = await runNavImport({ config, fetch, sleep: noSleep });

        expect(fetch).toHaveBeenCalledOnce();
        expect(hrefOf(fetch.mock.calls[0]![0])).toBe(AMFI_URL);
        expect(result).toEqual({
            fileDate: '2026-10-07',
            created: 11,
            updated: 0,
            active: 9,
            inactive: 2,
            skippedEtfs: 1,
            historyAppended: 0,
        });
        expect(await Scheme.countDocuments()).toBe(11);

        const axis = await scheme(135762);
        expect(axis.name).toBe(
            "Axis Children's Fund - Direct Plan - Growth Option",
        );
        expect(axis.latestNav).toBe('29.2304');
        expect(axis.latestNavDate).toBe('2026-10-07');
        expect(axis.isActive).toBe(true);
        expect(axis.historySyncedAt).toBeNull();
        expect(axis.createdAt).toBeInstanceOf(Date);
    });

    it('does not import ETFs', async () => {
        await importFixture(fixture);

        expect(await Scheme.exists({ amfiCode: 151533 })).toBeNull();
    });

    it('marks schemes without a recent NAV inactive', async () => {
        await importFixture(fixture);

        expect((await scheme(134568)).isActive).toBe(false);
        expect((await scheme(133786)).isActive).toBe(false);
    });

    it('does not duplicate schemes when run twice', async () => {
        await importFixture(fixture);
        const second = await importFixture(fixture);

        expect(await Scheme.countDocuments()).toBe(11);
        expect(second.created).toBe(0);
        expect(second.updated).toBe(11);
    });

    it('updates NAVs and activity from a newer file', async () => {
        await importFixture(fixture);

        await importFixture(
            fixture.replace(
                'Growth Option;29.2304;07-Oct-2026',
                'Growth Option;30.1000;20-Nov-2026',
            ),
        );

        const updated = await scheme(135762);
        expect(updated.latestNav).toBe('30.1000');
        expect(updated.latestNavDate).toBe('2026-11-20');
        expect(updated.isActive).toBe(true);

        // Every other scheme is now more than 30 days behind the file date.
        expect((await scheme(119133)).isActive).toBe(false);
    });

    it('keeps the last known NAV when a NAV is unpublished', async () => {
        await importFixture(fixture);

        await importFixture(
            fixture.replace(
                'Growth Option;29.2304;07-Oct-2026',
                'Growth Option;N.A.;08-Oct-2026',
            ),
        );

        const axis = await scheme(135762);
        expect(axis.latestNav).toBe('29.2304');
        expect(axis.latestNavDate).toBe('2026-10-07');
    });

    it('stores null NAV fields for a new scheme with no published NAV', async () => {
        await importFixture(fixture);

        const uti = await scheme(100026);
        expect(uti.latestNav).toBeNull();
        expect(uti.latestNavDate).toBeNull();
    });

    it('appends the NAV of tracked schemes to history once', async () => {
        await importFixture(fixture);
        await Scheme.updateOne(
            { amfiCode: 135762 },
            { historySyncedAt: new Date() },
        );

        const second = await importFixture(fixture);
        const third = await importFixture(fixture);

        expect(second.historyAppended).toBe(1);
        expect(third.historyAppended).toBe(0);

        const history = await NavHistory.find().lean();
        expect(history).toHaveLength(1);
        expect(history[0]!.navDate).toBe('2026-10-07');
        expect(history[0]!.nav).toBe('29.2304');
    });

    it('adds no history for untracked schemes', async () => {
        await importFixture(fixture);

        expect(await NavHistory.countDocuments()).toBe(0);
    });

    it('fails when AMFI is down, after retrying', async () => {
        const fetch = fakeFetch('Service unavailable', 503);
        const sleep = vi.fn(noSleep);

        await expect(runNavImport({ config, fetch, sleep })).rejects.toThrow(
            AmfiDownloadError,
        );

        expect(fetch).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledWith(2000);
        expect(await Scheme.countDocuments()).toBe(0);
    });

    it('fails when the connection fails', async () => {
        const fetch = vi.fn(async () => {
            throw new TypeError('fetch failed');
        });

        await expect(
            runNavImport({ config, fetch, sleep: noSleep }),
        ).rejects.toThrow(/Could not download the AMFI NAV file: fetch failed/);
    });

    it('fails on a page that is not a NAV file', async () => {
        await expect(importFixture('<html>Maintenance</html>')).rejects.toThrow(
            AmfiNavFileError,
        );
    });

    it('imports a local file without downloading', async () => {
        const fetch = fakeFetch('');

        await runNavImport({ config, file: FIXTURE_PATH, fetch });

        expect(fetch).not.toHaveBeenCalled();
        expect(await Scheme.countDocuments()).toBe(11);
    });

    it('fails on a missing local file', async () => {
        await expect(
            runNavImport({ config, file: '/nonexistent/NAVAll.txt' }),
        ).rejects.toThrow(AmfiNavFileError);
    });

    it('refuses to run while another import holds the lock', async () => {
        await withJobLock('nav-import', 30, async () => {
            await expect(importFixture(fixture)).rejects.toThrow(
                JobLockedError,
            );
        });

        // Released afterwards.
        await importFixture(fixture);
        expect(await Scheme.countDocuments()).toBe(11);
    });
});

describe('withJobLock', () => {
    useTestDb();

    it('releases the lock when the job throws', async () => {
        await expect(
            withJobLock('demo', 30, async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');

        await expect(withJobLock('demo', 30, async () => 'ok')).resolves.toBe(
            'ok',
        );
    });

    it('takes over an expired lock', async () => {
        const { JobLock } = await import('../../src/models/jobLock.js');
        await JobLock.create({
            key: 'demo',
            owner: 'crashed-run',
            expiresAt: new Date(Date.now() - 1000),
        });

        await expect(withJobLock('demo', 30, async () => 'ok')).resolves.toBe(
            'ok',
        );
    });
});
