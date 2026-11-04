/** A large language model behind a single completion call (port of App\Ai\AiProvider and friends). */

export type AiMessage = { role: 'user' | 'assistant'; content: string };

export type AiRequest = {
    system: string;
    /** Oldest first, ending with the user's turn. */
    messages: AiMessage[];
    maxOutputTokens: number;
};

export type AiResponse = {
    text: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
};

export interface AiProvider {
    /** Short provider name for usage logs, e.g. "groq". */
    readonly name: string;
    /** @throws AiUnavailableError when the provider can't answer right now */
    complete(request: AiRequest): Promise<AiResponse>;
}

/** The provider timed out, failed, rate-limited us or returned nothing usable. */
export class AiUnavailableError extends Error {
    override name = 'AiUnavailableError';

    constructor(
        message: string,
        readonly retryAfterSeconds: number | null = null,
        options?: { cause?: unknown },
    ) {
        super(message, options);
    }
}

/** The user has used this month's allowance. */
export class AiQuotaExceededError extends Error {
    override name = 'AiQuotaExceededError';
}
