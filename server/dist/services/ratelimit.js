// Sliding window rate limit tracker with SQLite persistence.
import { getDb } from '../db/index.js';
// Key format: "platform:modelId:keyId:type" where type is rpm|rpd|tpm|tpd
const windows = new Map();
function getWindow(key) {
    let w = windows.get(key);
    if (!w) {
        w = { timestamps: [], tokenCount: 0, tokenTimestamps: [] };
        windows.set(key, w);
    }
    return w;
}
function pruneTimestamps(timestamps, windowMs, now) {
    const cutoff = now - windowMs;
    return timestamps.filter(ts => ts > cutoff);
}
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
function withDb(fn) {
    try {
        return fn(getDb());
    }
    catch {
        return undefined;
    }
}
function recordUsage(platform, modelId, keyId, kind, tokens, now) {
    withDb(db => {
        db.prepare(`
      INSERT INTO rate_limit_usage (platform, model_id, key_id, kind, tokens, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(platform, modelId, keyId, kind, tokens, now);
        db.prepare('DELETE FROM rate_limit_usage WHERE created_at_ms <= ?').run(now - DAY);
    });
}
function countPersistedRequests(platform, modelId, keyId, windowMs, now) {
    return withDb(db => {
        const row = db.prepare(`
      SELECT COUNT(*) AS used
        FROM rate_limit_usage
       WHERE platform = ?
         AND model_id = ?
         AND key_id = ?
         AND kind = 'request'
         AND created_at_ms > ?
    `).get(platform, modelId, keyId, now - windowMs);
        return row.used;
    });
}
function sumPersistedTokens(platform, modelId, keyId, windowMs, now) {
    return withDb(db => {
        const row = db.prepare(`
      SELECT COALESCE(SUM(tokens), 0) AS used
        FROM rate_limit_usage
       WHERE platform = ?
         AND model_id = ?
         AND key_id = ?
         AND kind = 'tokens'
         AND created_at_ms > ?
    `).get(platform, modelId, keyId, now - windowMs);
        return row.used;
    });
}
function memoryRequestCount(key, windowMs, now) {
    const w = getWindow(key);
    w.timestamps = pruneTimestamps(w.timestamps, windowMs, now);
    return w.timestamps.length;
}
function memoryTokenCount(key, windowMs, now) {
    const w = getWindow(key);
    w.tokenTimestamps = w.tokenTimestamps.filter(t => t.ts > now - windowMs);
    return w.tokenTimestamps.reduce((sum, t) => sum + t.tokens, 0);
}
function requestCount(platform, modelId, keyId, windowMs, now) {
    const persisted = countPersistedRequests(platform, modelId, keyId, windowMs, now);
    if (persisted !== undefined)
        return persisted;
    const type = windowMs === MINUTE ? 'rpm' : 'rpd';
    return memoryRequestCount(`${platform}:${modelId}:${keyId}:${type}`, windowMs, now);
}
function tokenCount(platform, modelId, keyId, windowMs, now) {
    const persisted = sumPersistedTokens(platform, modelId, keyId, windowMs, now);
    if (persisted !== undefined)
        return persisted;
    const type = windowMs === MINUTE ? 'tpm' : 'tpd';
    return memoryTokenCount(`${platform}:${modelId}:${keyId}:${type}`, windowMs, now);
}
export function canMakeRequest(platform, modelId, keyId, limits) {
    const now = Date.now();
    if (limits.rpm !== null) {
        if (requestCount(platform, modelId, keyId, MINUTE, now) >= limits.rpm)
            return false;
    }
    if (limits.rpd !== null) {
        if (requestCount(platform, modelId, keyId, DAY, now) >= limits.rpd)
            return false;
    }
    return true;
}
export function canUseTokens(platform, modelId, keyId, estimatedTokens, limits) {
    const now = Date.now();
    if (limits.tpm !== null) {
        const used = tokenCount(platform, modelId, keyId, MINUTE, now);
        if (used + estimatedTokens > limits.tpm)
            return false;
    }
    if (limits.tpd !== null) {
        const used = tokenCount(platform, modelId, keyId, DAY, now);
        if (used + estimatedTokens > limits.tpd)
            return false;
    }
    return true;
}
export function recordRequest(platform, modelId, keyId) {
    const now = Date.now();
    const rpmKey = `${platform}:${modelId}:${keyId}:rpm`;
    getWindow(rpmKey).timestamps.push(now);
    const rpdKey = `${platform}:${modelId}:${keyId}:rpd`;
    getWindow(rpdKey).timestamps.push(now);
    recordUsage(platform, modelId, keyId, 'request', 0, now);
}
export function recordTokens(platform, modelId, keyId, tokens) {
    const now = Date.now();
    const tpmKey = `${platform}:${modelId}:${keyId}:tpm`;
    getWindow(tpmKey).tokenTimestamps.push({ ts: now, tokens });
    const tpdKey = `${platform}:${modelId}:${keyId}:tpd`;
    getWindow(tpdKey).tokenTimestamps.push({ ts: now, tokens });
    recordUsage(platform, modelId, keyId, 'tokens', tokens, now);
}
// Cooldown: when a provider returns 429, block that model+key for a period
const cooldowns = new Map(); // key -> expiry timestamp
// Escalating cooldown: track hits per key over a rolling 24h window so a
// daily-quota exhaustion (OpenRouter free: 50/day, Cohere free: 33/day, etc.)
// quarantines the key for the rest of the day instead of looping through
// the 2-minute cooldown 20 times per request and consuming every fallback slot.
// In-memory only — state resets on restart, which is fine (a clean restart
// will re-escalate on the next 429 if the quota is genuinely exhausted).
const cooldownHits = new Map(); // key -> timestamps of recent cooldown set events
const HOUR = 60 * MINUTE;
const COOLDOWN_DURATIONS = [
    2 * MINUTE, // 1st hit in 24h
    10 * MINUTE, // 2nd
    HOUR, // 3rd
    DAY, // 4th and beyond
];
export function getNextCooldownDuration(platform, modelId, keyId) {
    const key = `${platform}:${modelId}:${keyId}`;
    const now = Date.now();
    const hits = (cooldownHits.get(key) ?? []).filter(t => t > now - DAY);
    hits.push(now);
    cooldownHits.set(key, hits);
    const idx = Math.min(hits.length - 1, COOLDOWN_DURATIONS.length - 1);
    return COOLDOWN_DURATIONS[idx];
}
function persistedCooldownExpiry(platform, modelId, keyId) {
    return withDb(db => {
        const row = db.prepare(`
      SELECT expires_at_ms
        FROM rate_limit_cooldowns
       WHERE platform = ?
         AND model_id = ?
         AND key_id = ?
    `).get(platform, modelId, keyId);
        return row?.expires_at_ms ?? null;
    });
}
function persistCooldown(platform, modelId, keyId, expiresAtMs) {
    withDb(db => {
        db.prepare(`
      INSERT INTO rate_limit_cooldowns (platform, model_id, key_id, expires_at_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(platform, model_id, key_id)
      DO UPDATE SET expires_at_ms = excluded.expires_at_ms
    `).run(platform, modelId, keyId, expiresAtMs);
    });
}
function clearPersistedCooldown(platform, modelId, keyId) {
    withDb(db => {
        db.prepare(`
      DELETE FROM rate_limit_cooldowns
       WHERE platform = ?
         AND model_id = ?
         AND key_id = ?
    `).run(platform, modelId, keyId);
    });
}
export function setCooldown(platform, modelId, keyId, durationMs = 60_000) {
    const key = `${platform}:${modelId}:${keyId}:cooldown`;
    const expiresAtMs = Date.now() + durationMs;
    cooldowns.set(key, expiresAtMs);
    persistCooldown(platform, modelId, keyId, expiresAtMs);
}
export function isOnCooldown(platform, modelId, keyId) {
    const key = `${platform}:${modelId}:${keyId}:cooldown`;
    const now = Date.now();
    const persistedExpiry = persistedCooldownExpiry(platform, modelId, keyId);
    if (persistedExpiry !== undefined && persistedExpiry !== null) {
        if (now > persistedExpiry) {
            cooldowns.delete(key);
            clearPersistedCooldown(platform, modelId, keyId);
            return false;
        }
        cooldowns.set(key, persistedExpiry);
        return true;
    }
    const expiry = cooldowns.get(key);
    if (!expiry)
        return false;
    if (now > expiry) {
        cooldowns.delete(key);
        return false;
    }
    return true;
}
export function getRateLimitStatus(platform, modelId, keyId, limits) {
    const now = Date.now();
    return {
        rpm: { used: requestCount(platform, modelId, keyId, MINUTE, now), limit: limits.rpm },
        rpd: { used: requestCount(platform, modelId, keyId, DAY, now), limit: limits.rpd },
        tpm: { used: tokenCount(platform, modelId, keyId, MINUTE, now), limit: limits.tpm },
    };
}
//# sourceMappingURL=ratelimit.js.map