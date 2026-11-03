/**
 * The nav-import job (port of the nav:import command): download AMFI's
 * NAVAll.txt, or read a local copy, and import it.
 * Run by POST /internal/jobs/nav-import (hPanel cron) and `npm run job:nav-import`.
 */
import { readFile } from 'node:fs/promises';

import type { Config } from '../config.js';
import { withJobLock } from '../lib/jobLock.js';
import {
    AmfiNavFileError,
    parseAmfiNavFile,
} from '../nav/amfiNavFileParser.js';
import { type NavImportResult, importNavs } from '../nav/navImporter.js';

/** AMFI could not be reached or answered with an error status. */
export class AmfiDownloadError extends Error {
    override name = 'AmfiDownloadError';
}

export type NavImportOptions = {
    config: Pick<Config, 'AMFI_NAV_URL' | 'AMFI_TIMEOUT_SECONDS'>;
    /** Import this local file instead of downloading. */
    file?: string;
    fetch?: typeof fetch;
    /** Waits between download attempts; tests pass a no-op. */
    sleep?: (ms: number) => Promise<void>;
};

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;
const LOCK_MINUTES = 30;

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * @throws AmfiDownloadError | AmfiNavFileError | JobLockedError
 */
export function runNavImport(
    options: NavImportOptions,
): Promise<NavImportResult> {
    return withJobLock('nav-import', LOCK_MINUTES, async () => {
        const contents = await readContents(options);
        return importNavs(parseAmfiNavFile(contents));
    });
}

async function readContents(options: NavImportOptions): Promise<string> {
    if (options.file) {
        try {
            return await readFile(options.file, 'utf8');
        } catch {
            throw new AmfiNavFileError(`Cannot read [${options.file}].`);
        }
    }

    return download(options);
}

async function download(options: NavImportOptions): Promise<string> {
    const fetchFn = options.fetch ?? fetch;
    const sleep = options.sleep ?? defaultSleep;
    const { AMFI_NAV_URL: url, AMFI_TIMEOUT_SECONDS: timeout } = options.config;

    let lastError = '';

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        if (attempt > 1) await sleep(RETRY_DELAY_MS);

        try {
            const response = await fetchFn(url, {
                signal: AbortSignal.timeout(timeout * 1000),
            });

            if (response.ok) return await response.text();

            lastError = `HTTP ${response.status}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
    }

    throw new AmfiDownloadError(
        `Could not download the AMFI NAV file: ${lastError}`,
    );
}
