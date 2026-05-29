import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk, ChatToolDefinition, ChatToolChoice, Platform } from '@freellmapi/shared/types.js';
export interface CompletionOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    tools?: ChatToolDefinition[];
    tool_choice?: ChatToolChoice;
    parallel_tool_calls?: boolean;
}
export declare abstract class BaseProvider {
    abstract readonly platform: Platform;
    abstract readonly name: string;
    abstract chatCompletion(apiKey: string, messages: ChatMessage[], modelId: string, options?: CompletionOptions): Promise<ChatCompletionResponse>;
    abstract streamChatCompletion(apiKey: string, messages: ChatMessage[], modelId: string, options?: CompletionOptions): AsyncGenerator<ChatCompletionChunk>;
    abstract validateKey(apiKey: string): Promise<boolean>;
    protected fetchWithTimeout(url: string, init: RequestInit, timeoutMs?: number): Promise<Response>;
    protected makeId(): string;
}
//# sourceMappingURL=base.d.ts.map