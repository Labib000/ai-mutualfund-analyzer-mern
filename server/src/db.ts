import mongoose from 'mongoose';

import type { Logger } from './lib/logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(
    uri: string,
    logger?: Logger,
): Promise<typeof mongoose> {
    const connection = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        autoIndex: true,
    });

    logger?.info(
        { host: connection.connection.host, db: connection.connection.name },
        'MongoDB connected',
    );

    return connection;
}

export async function disconnectDb(): Promise<void> {
    await mongoose.disconnect();
}

/** True if the connection is open and answers a ping within the timeout. */
export async function pingDb(timeoutMs = 2_000): Promise<boolean> {
    const db = mongoose.connection.db;

    if (
        mongoose.connection.readyState !==
            mongoose.ConnectionStates.connected ||
        !db
    ) {
        return false;
    }

    let timer: NodeJS.Timeout | undefined;

    try {
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error('ping timed out')),
                timeoutMs,
            );
        });

        const result = await Promise.race([db.admin().ping(), timeout]);

        return result?.ok === 1;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}
