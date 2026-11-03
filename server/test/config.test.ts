import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';

const SECRET = 's'.repeat(32);
const base = {
    MONGODB_URI: 'mongodb://localhost/hisaab',
    SESSION_SECRET: SECRET,
};

describe('loadConfig', () => {
    it('applies defaults', () => {
        const config = loadConfig({
            MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/hisaab',
            SESSION_SECRET: SECRET,
        });

        expect(config.NODE_ENV).toBe('development');
        expect(config.PORT).toBe(3000);
        expect(config.APP_URL).toBe('http://localhost:5173');
    });

    it('coerces PORT and treats empty optional strings as unset', () => {
        const config = loadConfig({ ...base, PORT: '8080', CRON_SECRET: '' });

        expect(config.PORT).toBe(8080);
        expect(config.CRON_SECRET).toBeUndefined();
    });

    it('requires MONGODB_URI', () => {
        expect(() => loadConfig({ SESSION_SECRET: SECRET })).toThrow(
            ConfigError,
        );
        expect(() => loadConfig({ SESSION_SECRET: SECRET })).toThrow(
            /MONGODB_URI/,
        );
    });

    it('rejects a URI that is not a MongoDB URI', () => {
        expect(() =>
            loadConfig({ ...base, MONGODB_URI: 'postgres://localhost/db' }),
        ).toThrow(/must start with mongodb/);
    });

    it('requires a SESSION_SECRET of at least 32 characters', () => {
        const { MONGODB_URI } = base;

        expect(() => loadConfig({ MONGODB_URI })).toThrow(
            /SESSION_SECRET is required/,
        );
        expect(() =>
            loadConfig({ MONGODB_URI, SESSION_SECRET: 'short' }),
        ).toThrow(/at least 32 characters/);
    });

    it('lists every problem at once', () => {
        expect(() => loadConfig({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
            /NODE_ENV[\s\S]*PORT[\s\S]*MONGODB_URI[\s\S]*SESSION_SECRET/,
        );
    });
});
