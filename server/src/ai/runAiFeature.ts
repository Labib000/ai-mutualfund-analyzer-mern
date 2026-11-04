/**
 * The one path to the AI provider: checks the quota, calls the provider and
 * logs every call, successful or not (port of App\Ai\RunAiFeature).
 */
import type { Types } from 'mongoose';

import type { Logger } from '../lib/logger.js';
import { now } from '../lib/today.js';
import { type AiFeature, AiUsage } from '../models/aiUsage.js';
import type { AiQuota } from './aiQuota.js';
import {
    type AiProvider,
    type AiRequest,
    type AiResponse,
    AiUnavailableError,
} from './provider.js';

export class RunAiFeature {
    constructor(
        private readonly provider: AiProvider,
        readonly quota: AiQuota,
        /** Logged for failed calls, which have no response model. */
        private readonly model: string,
        private readonly logger?: Logger,
    ) {}

    /**
     * @throws AiQuotaExceededError
     * @throws AiUnavailableError
     */
    async handle(
        userId: Types.ObjectId,
        feature: AiFeature,
        request: AiRequest,
    ): Promise<AiResponse> {
        await this.quota.ensureAvailable(userId);

        let response: AiResponse;
        try {
            response = await this.provider.complete(request);
        } catch (error) {
            if (error instanceof AiUnavailableError) {
                await this.log(userId, feature, this.model, 0, 0, false);
                this.logger?.warn(
                    { err: error, feature },
                    'AI provider unavailable',
                );
            }
            throw error;
        }

        await this.log(
            userId,
            feature,
            response.model,
            response.inputTokens,
            response.outputTokens,
            true,
        );
        return response;
    }

    private async log(
        userId: Types.ObjectId,
        feature: AiFeature,
        model: string,
        inputTokens: number,
        outputTokens: number,
        succeeded: boolean,
    ): Promise<void> {
        await AiUsage.create({
            userId,
            feature,
            provider: this.provider.name,
            model,
            inputTokens,
            outputTokens,
            succeeded,
            createdAt: now(),
        });
    }
}
