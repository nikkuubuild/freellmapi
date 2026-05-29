import type { BaseProvider } from '../providers/base.js';
export interface RouteResult {
    provider: BaseProvider;
    modelId: string;
    modelDbId: number;
    apiKey: string;
    keyId: number;
    platform: string;
    displayName: string;
}
/**
 * Record a 429 for a model — increases its penalty so it sinks in priority.
 */
export declare function recordRateLimitHit(modelDbId: number): void;
/**
 * Record a success for a model — reduces its penalty so it rises back up.
 */
export declare function recordSuccess(modelDbId: number): void;
/**
 * Get current penalties for all models (for the API/dashboard).
 */
export declare function getAllPenalties(): Array<{
    modelDbId: number;
    count: number;
    penalty: number;
}>;
/**
 * Route a request to the best available model.
 * Models are sorted by (base_priority + rate_limit_penalty) so frequently
 * rate-limited models automatically sink below working ones.
 *
 * If preferredModelDbId is set, that model gets tried FIRST (sticky sessions).
 * This prevents hallucination from model switching mid-conversation.
 *
 * @param estimatedTokens - estimated total tokens for rate limit check
 * @param skipKeys - set of "platform:modelId:keyId" to skip (failed on this request)
 * @param preferredModelDbId - try this model first (sticky session)
 */
export declare function routeRequest(estimatedTokens?: number, skipKeys?: Set<string>, preferredModelDbId?: number): RouteResult;
//# sourceMappingURL=router.d.ts.map