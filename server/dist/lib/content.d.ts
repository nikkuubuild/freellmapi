import type { ChatMessage } from '@freellmapi/shared/types.js';
export type ContentTextBlock = {
    type: 'text';
    text: string;
};
export type ContentBlock = ContentTextBlock | {
    type: string;
    [key: string]: unknown;
};
export declare function contentToString(content: unknown): string;
export declare function flattenMessageContent(messages: ChatMessage[]): ChatMessage[];
//# sourceMappingURL=content.d.ts.map