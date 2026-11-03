import path from 'node:path';

import { pino } from 'pino';

import type { Config } from '../config.js';
import { REPO_ROOT } from './paths.js';

export type Logger = pino.Logger;

/** Absolute log-file path, or null when file logging is off. */
export function resolveLogFile(
    config: Pick<Config, 'NODE_ENV' | 'LOG_FILE'>,
): string | null {
    const file =
        config.LOG_FILE ??
        (config.NODE_ENV === 'development' ? 'logs/server.log' : '');

    return file === '' ? null : path.resolve(REPO_ROOT, file);
}

/**
 * JSON logs to stdout (what Hostinger collects) and, when configured,
 * appended to a file as well.
 */
export function createLogger(
    config: Pick<Config, 'NODE_ENV' | 'LOG_LEVEL' | 'LOG_FILE'>,
): Logger {
    const level =
        config.LOG_LEVEL ?? (config.NODE_ENV === 'test' ? 'silent' : 'info');
    const options: pino.LoggerOptions = {
        level,
        redact: ['req.headers.cookie', 'req.headers.authorization'],
    };

    const logFile = resolveLogFile(config);

    if (!logFile) {
        return pino(options);
    }

    // Sync writes so a fatal line is on disk before process.exit().
    const file = pino.destination({ dest: logFile, mkdir: true, sync: true });

    return pino(
        options,
        pino.multistream([
            { level, stream: process.stdout },
            { level, stream: file },
        ]),
    );
}
