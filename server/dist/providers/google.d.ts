import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk } from '@freellmapi/shared/types.js';
import { BaseProvider, type CompletionOptions } from './base.js';
export declare function sanitizeForGemini(schema: unknown): unknown;
export declare class GoogleProvider extends BaseProvider {
    readonly platform: "google";
    readonly name = "Google AI Studio";
    chatCompletion(apiKey: string, messages: ChatMessage[], modelId: string, options?: CompletionOptions): Promise<ChatCompletionResponse>;
    streamChatCompletion(apiKey: string, messages: ChatMessage[], modelId: string, options?: CompletionOptions): AsyncGenerator<ChatCompletionChunk>;
    validateKey(apiKey: string): Promise<boolean>;
}
//# sourceMappingURL=google.d.ts.map