/**
 * Groq's OpenAI-compatible chat completions API (port of App\Ai\GroqProvider).
 * See https://console.groq.com/docs/reasoning for the gpt-oss reasoning parameters.
 */
import {
    type AiProvider,
    type AiRequest,
    type AiResponse,
    AiUnavailableError,
} from './provider.js';

export type GroqOptions = {
    apiKey: string | undefined;
    model: string;
    /** Null (or "none") for models without reasoning. */
    reasoningEffort: string | null;
    timeoutSeconds: number;
    baseUrl: string;
    fetch?: typeof fetch;
};

type Completion = {
    model?: unknown;
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

export class GroqProvider implements AiProvider {
    readonly name = 'groq';

    constructor(private readonly options: GroqOptions) {}

    async complete(request: AiRequest): Promise<AiResponse> {
        const { apiKey, model, reasoningEffort, timeoutSeconds, baseUrl } =
            this.options;
        if (!apiKey)
            throw new AiUnavailableError('No AI API key is configured.');

        const payload: Record<string, unknown> = {
            model,
            messages: [
                { role: 'system', content: request.system },
                ...request.messages,
            ],
            max_completion_tokens: request.maxOutputTokens,
        };
        if (reasoningEffort && reasoningEffort !== 'none') {
            // Reasoning text would otherwise be returned alongside the answer.
            payload.reasoning_effort = reasoningEffort;
            payload.include_reasoning = false;
        }

        let response: Response;
        try {
            // No automatic retries: a user is waiting on this request.
            response = await (this.options.fetch ?? fetch)(
                `${baseUrl.replace(/\/$/, '')}/chat/completions`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(timeoutSeconds * 1000),
                },
            );
        } catch (error) {
            throw new AiUnavailableError(
                `Groq request failed: ${(error as Error).message}`,
                null,
                { cause: error },
            );
        }

        if (response.status === 429) {
            const retryAfter = Number(response.headers.get('retry-after'));
            throw new AiUnavailableError(
                'Groq rate limit reached.',
                Number.isFinite(retryAfter) && retryAfter > 0
                    ? Math.ceil(retryAfter)
                    : null,
            );
        }
        if (!response.ok)
            throw new AiUnavailableError(
                `Groq returned HTTP ${response.status}.`,
            );

        let body: Completion;
        try {
            body = (await response.json()) as Completion;
        } catch (error) {
            throw new AiUnavailableError(
                'Groq returned a malformed body.',
                null,
                { cause: error },
            );
        }

        const choice = body.choices?.[0];
        const text = choice?.message?.content;
        if (typeof text !== 'string' || text.trim() === '') {
            // Typically the output limit was spent on reasoning (finish_reason "length").
            const reason =
                typeof choice?.finish_reason === 'string'
                    ? choice.finish_reason
                    : 'unknown';
            throw new AiUnavailableError(
                `Groq returned no answer (finish reason: ${reason}).`,
            );
        }

        return {
            text: text.trim(),
            model: typeof body.model === 'string' ? body.model : model,
            inputTokens: Number(body.usage?.prompt_tokens) || 0,
            outputTokens: Number(body.usage?.completion_tokens) || 0,
        };
    }
}
