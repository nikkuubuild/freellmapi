export function contentToString(content) {
    if (typeof content === 'string')
        return content;
    if (content == null)
        return '';
    if (Array.isArray(content)) {
        return content
            .map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text : ''))
            .join('');
    }
    return '';
}
export function flattenMessageContent(messages) {
    return messages.map((m) => ({
        ...m,
        content: contentToString(m.content),
    }));
}
//# sourceMappingURL=content.js.map