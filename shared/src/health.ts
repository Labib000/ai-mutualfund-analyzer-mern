import { z } from 'zod';

/** Response of GET /api/health. Shared so the client can parse it. */
export const healthResponseSchema = z.object({
    status: z.enum(['ok', 'degraded']),
    db: z.enum(['up', 'down']),
    /** IST calendar date on the server, "YYYY-MM-DD". */
    today: z.string(),
    time: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
