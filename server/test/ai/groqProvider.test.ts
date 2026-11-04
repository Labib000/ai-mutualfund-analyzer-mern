import { describe, expect, it, vi } from 'vitest';

import { GroqProvider } from '../../src/ai/groqProvider.js';
import { AiUnavailableError } from '../../src/ai/provider.js';

// Port of tests/Feature/Ai/GroqProviderTest.php
const URL = 'https://api.groq.com/openai/v1/chat/completions';

const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
    });

function provider(
    fetch: typeof globalThis.fetch,
    reasoningEffort: string | null = 'low',
    apiKey = 'test-key',
) {
    return new GroqProvider({
        apiKey,
        model: 'openai/gpt-oss-120b',
        reasoningEffort,
        timeoutSeconds: 20,
        baseUrl: 'https://api.groq.com/openai/v1',
        fetch,
    });
}

const simple = {
    system: 'S',
    messages: [{ role: 'user' as const, content: 'Q' }],
    maxOutputTokens: 500,
};

async function unavailable(
    promise: Promise<unknown>,
): Promise<AiUnavailableError> {
    const error = await promise.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AiUnavailableError);
    return error as AiUnavailableError;
}

describe('GroqProvider', () => {
    it('sends an OpenAI-compatible request and reads the answer', async () => {
        const fetch = vi.fn(async () =>
            json({
                model: 'openai/gpt-oss-120b',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: '  Your portfolio grew.\n',
                        },
                        finish_reason: 'stop',
                    },
                ],
                usage: { prompt_tokens: 812, completion_tokens: 240 },
            }),
        );

        const response = await provider(fetch).complete({
            system: 'Be helpful.',
            messages: [
                { role: 'user', content: 'Earlier question' },
                { role: 'assistant', content: 'Earlier answer' },
                { role: 'user', content: 'How am I doing?' },
            ],
            maxOutputTokens: 1500,
        });

        expect(response).toEqual({
            text: 'Your portfolio grew.',
            model: 'openai/gpt-oss-120b',
            inputTokens: 812,
            outputTokens: 240,
        });

        const [url, init] = fetch.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        const sent = JSON.parse(init.body as string);
        expect(url).toBe(URL);
        expect((init.headers as Record<string, string>).Authorization).toBe(
            'Bearer test-key',
        );
        expect(sent.model).toBe('openai/gpt-oss-120b');
        expect(sent.messages[0]).toEqual({
            role: 'system',
            content: 'Be helpful.',
        });
        expect(sent.messages[3]).toEqual({
            role: 'user',
            content: 'How am I doing?',
        });
        expect(sent.max_completion_tokens).toBe(1500);
        expect(sent.reasoning_effort).toBe('low');
        expect(sent.include_reasoning).toBe(false);
    });

    it('leaves the reasoning parameters out for other models', async () => {
        for (const effort of [null, 'none']) {
            const fetch = vi.fn(async () =>
                json({ choices: [{ message: { content: 'Hi' } }] }),
            );
            await provider(fetch, effort).complete(simple);

            const sent = JSON.parse(
                (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
                    .body as string,
            );
            expect(sent).not.toHaveProperty('reasoning_effort');
            expect(sent).not.toHaveProperty('include_reasoning');
        }
    });

    it('carries the retry-after delay on a rate limit', async () => {
        const fetch = vi.fn(async () =>
            json({ error: { message: 'Rate limit' } }, 429, {
                'retry-after': '7.5',
            }),
        );
        expect(
            (await unavailable(provider(fetch).complete(simple)))
                .retryAfterSeconds,
        ).toBe(8);
    });

    it('treats server errors as unavailable', async () => {
        await unavailable(
            provider(vi.fn(async () => json('Bad gateway', 502))).complete(
                simple,
            ),
        );
    });

    it('treats connection failures as unavailable', async () => {
        const fetch = vi.fn(async () => {
            throw new TypeError('fetch failed');
        });
        await unavailable(provider(fetch).complete(simple));
    });

    it('treats an answer cut off during reasoning as unavailable', async () => {
        const fetch = vi.fn(async () =>
            json({
                choices: [
                    { message: { content: '' }, finish_reason: 'length' },
                ],
            }),
        );
        expect(
            (await unavailable(provider(fetch).complete(simple))).message,
        ).toContain('finish reason: length');
    });

    it('treats a malformed body as unavailable', async () => {
        await unavailable(
            provider(vi.fn(async () => json('<html>oops</html>'))).complete(
                simple,
            ),
        );
    });

    it('fails without calling Groq when no key is set', async () => {
        const fetch = vi.fn();
        const error = await unavailable(
            provider(fetch, 'low', '').complete(simple),
        );
        expect(error.message).toContain('No AI API key');
        expect(fetch).not.toHaveBeenCalled();
    });
});
