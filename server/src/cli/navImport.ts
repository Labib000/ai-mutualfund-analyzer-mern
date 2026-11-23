/**
 * Import the AMFI scheme list and latest NAVs (port of `php artisan nav:import`).
 *   npm run job:nav-import
 *   npm run job:nav-import -- --file=path/to/NAVAll.txt
 */
import { parseArgs } from 'node:util';

import { ConfigError, loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { AmfiDownloadError, runNavImport } from '../jobs/navImport.js';
import { formatShort } from '../lib/dates.js';
import { JobLockUnavailableError, JobLockedError } from '../lib/jobLock.js';
import { connectRedisForCli, disconnectRedis } from '../lib/redis.js';
import { AmfiNavFileError } from '../nav/amfiNavFileParser.js';

async function main(): Promise<number> {
    const { values } = parseArgs({ options: { file: { type: 'string' } } });

    let config;
    try {
        config = loadConfig();
    } catch (error) {
        if (error instanceof ConfigError) {
            console.error(error.message);
            return 1;
        }
        throw error;
    }

    await connectDb(config.MONGODB_URI);
    // The job lock lives in Redis when it's configured: use the same one as
    // the server, or a CLI run could overlap a cron run.
    if (!(await connectRedisForCli(config.REDIS_URL))) {
        await disconnectDb();
        return 1;
    }

    try {
        const result = await runNavImport({ config, file: values.file });

        console.log(
            `Imported AMFI NAVs dated ${formatShort(result.fileDate)}.`,
        );
        console.table([
            {
                Created: result.created,
                Updated: result.updated,
                Active: result.active,
                Inactive: result.inactive,
                'ETFs skipped': result.skippedEtfs,
                'History rows added': result.historyAppended,
            },
        ]);
        return 0;
    } catch (error) {
        if (
            error instanceof AmfiDownloadError ||
            error instanceof JobLockedError ||
            error instanceof JobLockUnavailableError
        ) {
            console.error(error.message);
            return 1;
        }
        if (error instanceof AmfiNavFileError) {
            console.error(
                `The AMFI NAV file could not be imported: ${error.message}`,
            );
            return 1;
        }
        throw error;
    } finally {
        await disconnectRedis();
        await disconnectDb();
    }
}

process.exitCode = await main();
