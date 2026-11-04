import type { Config } from '../config.js';
import type { Logger } from '../lib/logger.js';
import { AiQuota } from './aiQuota.js';
import { GroqProvider } from './groqProvider.js';
import type { AiProvider } from './provider.js';
import { RunAiFeature } from './runAiFeature.js';

/** Everything the AI routes need. */
export type AiContext = {
    run: RunAiFeature;
    quota: AiQuota;
    config: Config;
};

export function createAiContext(options: {
    config: Config;
    logger: Logger;
    aiProvider?: AiProvider;
}): AiContext {
    const { config, logger } = options;
    const provider =
        options.aiProvider ??
        new GroqProvider({
            apiKey: config.AI_API_KEY,
            model: config.AI_MODEL,
            reasoningEffort: config.AI_REASONING_EFFORT,
            timeoutSeconds: config.AI_TIMEOUT_SECONDS,
            baseUrl: config.GROQ_BASE_URL,
        });
    const quota = new AiQuota(config.AI_MONTHLY_REQUESTS_PER_USER);
    return {
        run: new RunAiFeature(provider, quota, config.AI_MODEL, logger),
        quota,
        config,
    };
}
