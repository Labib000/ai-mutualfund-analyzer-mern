import path from 'node:path';

import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createLogger } from './lib/logger.js';

async function main(): Promise<void> {
    let config;

    try {
        config = loadConfig();
    } catch (error) {
        if (error instanceof ConfigError) {
            console.error(error.message);
            process.exit(1);
        }
        throw error;
    }

    const logger = createLogger(config);

    try {
        await connectDb(config.MONGODB_URI, logger);
    } catch (error) {
        logger.fatal(
            { err: error },
            'Could not connect to MongoDB. Check MONGODB_URI and that your IP is on the Atlas access list.',
        );
        process.exit(1);
    }

    const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
    const app = createApp({ config, logger, clientDist });

    const server = app.listen(config.PORT, () => {
        logger.info(
            { port: config.PORT, env: config.NODE_ENV },
            'Hisaab server listening',
        );
    });

    let shuttingDown = false;

    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal }, 'shutting down');

        server.close(() => {
            disconnectDb()
                .catch((err: unknown) =>
                    logger.error({ err }, 'error closing MongoDB'),
                )
                .finally(() => process.exit(0));
        });

        // Don't hang forever on keep-alive connections.
        setTimeout(() => process.exit(0), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
