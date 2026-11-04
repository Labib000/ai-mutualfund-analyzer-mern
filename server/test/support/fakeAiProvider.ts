import {
    type AiProvider,
    type AiRequest,
    type AiResponse,
    AiUnavailableError,
} from '../../src/ai/provider.js';

/** Records every request and answers with canned text, or fails on demand (port of tests/Support/FakeAiProvider). */
export class FakeAiProvider implements AiProvider {
    readonly name = 'fake';
    requests: AiRequest[] = [];
    failing = false;

    constructor(
        public answer = 'Your portfolio is worth more than you invested.',
    ) {}

    async complete(request: AiRequest): Promise<AiResponse> {
        this.requests.push(request);
        if (this.failing) throw new AiUnavailableError('Provider is down.');
        return {
            text: this.answer,
            model: 'fake-model',
            inputTokens: 1200,
            outputTokens: 300,
        };
    }

    lastUserMessage(): string {
        return this.requests.at(-1)?.messages.at(-1)?.content ?? '';
    }
}
