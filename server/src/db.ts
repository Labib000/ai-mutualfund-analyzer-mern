import mongoose from 'mongoose';

import type { Logger } from './lib/logger.js';
import { metrics } from './lib/metrics.js';

mongoose.set('strictQuery', true);

export async function connectDb(
    uri: string,
    logger?: Logger,
): Promise<typeof mongoose> {
    const connection = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        autoIndex: true,
        // Driver command events feed the load-test metrics (lib/metrics.ts).
        monitorCommands: true,
    });

    watchCommands(connection.connection.getClient());

    logger?.info(
        { host: connection.connection.host, db: connection.connection.name },
        'MongoDB connected',
    );

    return connection;
}

/** Handshakes and session bookkeeping, not queries the app makes. */
const IGNORED_COMMANDS = new Set([
    'hello',
    'isMaster',
    'ismaster',
    'ping',
    'endSessions',
    'saslStart',
    'saslContinue',
    'buildInfo',
]);

type CommandClient = ReturnType<typeof mongoose.connection.getClient>;

const watched = new WeakSet<CommandClient>();

function watchCommands(client: CommandClient): void {
    if (watched.has(client)) return;
    watched.add(client);

    // The finished events don't name the collection, so remember it by requestId.
    const pending = new Map<number, string | undefined>();

    client.on('commandStarted', (event) => {
        if (IGNORED_COMMANDS.has(event.commandName)) return;
        const target = (event.command as Record<string, unknown>)[
            event.commandName
        ];
        pending.set(
            event.requestId,
            typeof target === 'string' ? target : undefined,
        );
    });

    const finish = (
        event: { requestId: number; commandName: string; duration: number },
        failed: boolean,
    ) => {
        if (!pending.has(event.requestId)) return;
        const collection = pending.get(event.requestId);
        pending.delete(event.requestId);
        metrics.recordDbCommand(
            event.commandName,
            collection,
            event.duration,
            failed,
        );
    };

    client.on('commandSucceeded', (event) => finish(event, false));
    client.on('commandFailed', (event) => finish(event, true));
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
