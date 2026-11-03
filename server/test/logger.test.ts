import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLogger, resolveLogFile } from '../src/lib/logger.js';

describe('resolveLogFile', () => {
    it('defaults to logs/server.log at the repo root in development', () => {
        const file = resolveLogFile({ NODE_ENV: 'development' });

        expect(file).toBe(
            path.resolve(import.meta.dirname, '../../logs/server.log'),
        );
    });

    it('is off by default in test and production', () => {
        expect(resolveLogFile({ NODE_ENV: 'test' })).toBeNull();
        expect(resolveLogFile({ NODE_ENV: 'production' })).toBeNull();
    });

    it('can be turned off with an empty LOG_FILE', () => {
        expect(
            resolveLogFile({ NODE_ENV: 'development', LOG_FILE: '' }),
        ).toBeNull();
    });

    it('keeps absolute paths as given', () => {
        expect(
            resolveLogFile({ NODE_ENV: 'production', LOG_FILE: '/var/x.log' }),
        ).toBe('/var/x.log');
    });
});

describe('createLogger', () => {
    it('appends JSON lines to the log file, creating its folder', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'hisaab-log-'));
        const file = path.join(dir, 'nested', 'server.log');

        const logger = createLogger({
            NODE_ENV: 'test',
            LOG_LEVEL: 'info',
            LOG_FILE: file,
        });
        logger.info({ answer: 42 }, 'hello file');
        logger.debug('below level, not written');

        const lines = readFileSync(file, 'utf8').trim().split('\n');
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0]!)).toMatchObject({
            level: 30,
            answer: 42,
            msg: 'hello file',
        });
    });
});
