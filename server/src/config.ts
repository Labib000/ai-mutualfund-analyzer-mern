import { z } from 'zod';

const optionalString = z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional();

const envSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.url().default('http://localhost:5173'),
    MONGODB_URI: z
        .string()
        .trim()
        .min(1, 'MONGODB_URI is required (see .env.example)')
        .refine(
            (uri) =>
                uri.startsWith('mongodb://') ||
                uri.startsWith('mongodb+srv://'),
            'MONGODB_URI must start with mongodb:// or mongodb+srv://',
        ),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .optional(),
    /**
     * Also write logs to this file (relative paths are from the repo root).
     * Unset: logs/server.log in development, no file otherwise. Empty: no file.
     */
    LOG_FILE: z.string().trim().optional(),

    SESSION_SECRET: z
        .string({ error: 'SESSION_SECRET is required (see .env.example)' })
        .trim()
        .min(32, 'SESSION_SECRET must be at least 32 characters'),

    /** Shared secret hPanel cron sends as X-Cron-Secret; job endpoints answer 503 without it. */
    CRON_SECRET: optionalString,

    AMFI_NAV_URL: z
        .url()
        .default('https://www.amfiindia.com/spages/NAVAll.txt'),
    AMFI_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
    MFAPI_BASE_URL: z.url().default('https://api.mfapi.in'),
    MFAPI_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(15),

    // Required from Phase 4 onwards; optional while unused.
    AI_PROVIDER: optionalString,
    AI_API_KEY: optionalString,
    AI_MODEL: optionalString,
    MAIL_HOST: optionalString,
    MAIL_PORT: z.coerce.number().int().positive().optional(),
    MAIL_USERNAME: optionalString,
    MAIL_PASSWORD: optionalString,
    MAIL_FROM_ADDRESS: optionalString,
    MAIL_FROM_NAME: optionalString,
});

export type Config = z.infer<typeof envSchema>;

export class ConfigError extends Error {
    override name = 'ConfigError';
}

/** Parses env vars; throws a readable ConfigError listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const result = envSchema.safeParse(env);

    if (!result.success) {
        const problems = result.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');

        throw new ConfigError(
            `Invalid environment configuration:\n${problems}`,
        );
    }

    return result.data;
}
