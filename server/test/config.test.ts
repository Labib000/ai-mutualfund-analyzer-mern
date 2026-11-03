import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
    it('applies defaults', () => {
        const config = loadConfig({
            MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/hisaab',
        });

        expect(config.NODE_ENV).toBe('development');
        expect(config.PORT).toBe(3000);
        expect(config.APP_URL).toBe('http://localhost:5173');
    });

    it('coerces PORT and treats empty optional strings as unset', () => {
        const config = loadConfig({
            MONGODB_URI: 'mongodb://localhost/hisaab',
            PORT: '8080',
            SESSION_SECRET: '',
        });

        expect(config.PORT).toBe(8080);
        expect(config.SESSION_SECRET).toBeUndefined();
    });

    it('requires MONGODB_URI', () => {
        expect(() => loadConfig({})).toThrow(ConfigError);
        expect(() => loadConfig({})).toThrow(/MONGODB_URI/);
    });

    it('rejects a URI that is not a MongoDB URI', () => {
        expect(() =>
            loadConfig({ MONGODB_URI: 'postgres://localhost/db' }),
        ).toThrow(/must start with mongodb/);
    });

    it('lists every problem at once', () => {
        expect(() => loadConfig({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
            /NODE_ENV[\s\S]*PORT[\s\S]*MONGODB_URI|MONGODB_URI[\s\S]*PORT/,
        );
    });
});
