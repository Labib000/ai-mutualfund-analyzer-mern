/**
 * Record SIP installments whose NAV is now published (port of `php artisan sips:generate`).
 *   npm run job:sips-generate
 */
import { ConfigError, loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { runSipsGenerate } from '../jobs/sipsGenerate.js';
import { JobLockedError } from '../lib/jobLock.js';
import { createLogger } from '../lib/logger.js';
import { MfApiNavProvider } from '../nav/mfApiNavProvider.js';
import { NavLookup } from '../nav/navLookup.js';

async function main(): Promise<number> {
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

    const logger = createLogger(config);
    const navs = new NavLookup(
        new MfApiNavProvider({
            baseUrl: config.MFAPI_BASE_URL,
            timeoutSeconds: config.MFAPI_TIMEOUT_SECONDS,
        }),
        logger,
    );

    await connectDb(config.MONGODB_URI);

    try {
        const { created, failed } = await runSipsGenerate({ navs, logger });

        console.log(`Recorded ${created} SIP installment(s).`);
        if (failed > 0) {
            console.warn(
                `${failed} SIP(s) could not fetch NAV history and will be retried.`,
            );
        }
        return 0;
    } catch (error) {
        if (error instanceof JobLockedError) {
            console.error(error.message);
            return 1;
        }
        throw error;
    } finally {
        await disconnectDb();
    }
}

process.exitCode = await main();
