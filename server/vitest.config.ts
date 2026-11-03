import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        globalSetup: ['test/support/globalSetup.ts'],
        env: { NODE_ENV: 'test', TZ: 'UTC' },
        // First run downloads the mongod binary.
        hookTimeout: 120_000,
        testTimeout: 15_000,
    },
});
