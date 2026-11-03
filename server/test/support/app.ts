import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/lib/logger.js';

export function makeTestApp() {
    const config = loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
    });

    return createApp({ config, logger: createLogger(config) });
}
