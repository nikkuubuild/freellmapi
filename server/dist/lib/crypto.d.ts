import type { CompatDatabase } from '../db/compat.js';
/**
 * Initialize encryption key from env or an explicit local-dev fallback.
 * Must be called after DB is initialized.
 */
export declare function initEncryptionKey(db: CompatDatabase): void;
export declare function encrypt(text: string): {
    encrypted: string;
    iv: string;
    authTag: string;
};
export declare function decrypt(encrypted: string, iv: string, authTag: string): string;
export declare function maskKey(key: string): string;
//# sourceMappingURL=crypto.d.ts.map