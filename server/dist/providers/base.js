export class BaseProvider {
    async fetchWithTimeout(url, init, timeoutMs = 15000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        finally {
            clearTimeout(timeout);
        }
    }
    makeId() {
        return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
}
//# sourceMappingURL=base.js.map