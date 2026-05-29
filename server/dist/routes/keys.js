import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { encrypt, decrypt, maskKey } from '../lib/crypto.js';
export const keysRouter = Router();
// Active providers — must match providers/index.ts registrations + shared/types.ts Platform.
// Moonshot and MiniMax direct integrations were dropped in V4. HuggingFace
// was dropped in V4 and re-added in V13 via the router.huggingface.co route.
const PLATFORMS = [
    'google', 'groq', 'cerebras', 'sambanova', 'nvidia', 'mistral',
    'openrouter', 'github', 'cohere', 'cloudflare', 'zhipu', 'ollama',
    'kilo', 'pollinations', 'llm7', 'huggingface',
];
const addKeySchema = z.object({
    platform: z.enum(PLATFORMS),
    key: z.string().min(1),
    label: z.string().optional(),
});
// List all keys (masked)
keysRouter.get('/', (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
    const keys = rows.map(row => {
        let maskedKey = '****';
        try {
            const realKey = decrypt(row.encrypted_key, row.iv, row.auth_tag);
            maskedKey = maskKey(realKey);
        }
        catch {
            maskedKey = '[decrypt failed]';
        }
        return {
            id: row.id,
            platform: row.platform,
            label: row.label,
            maskedKey,
            status: row.status,
            enabled: row.enabled === 1,
            createdAt: row.created_at,
            lastCheckedAt: row.last_checked_at,
        };
    });
    res.json(keys);
});
// Add a key
keysRouter.post('/', (req, res) => {
    const parsed = addKeySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
        return;
    }
    const { platform, key, label } = parsed.data;
    const { encrypted, iv, authTag } = encrypt(key);
    const db = getDb();
    const result = db.prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, ?, ?, ?, ?, 'unknown', 1)
  `).run(platform, label ?? '', encrypted, iv, authTag);
    res.status(201).json({
        id: result.lastInsertRowid,
        platform,
        label: label ?? '',
        maskedKey: maskKey(key),
        status: 'unknown',
        enabled: true,
    });
});
// Delete a key
keysRouter.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: { message: 'Invalid key ID' } });
        return;
    }
    const db = getDb();
    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    if (result.changes === 0) {
        res.status(404).json({ error: { message: 'Key not found' } });
        return;
    }
    res.json({ success: true });
});
// Toggle all keys for a platform
keysRouter.patch('/platform/:platform', (req, res) => {
    const platform = req.params.platform;
    if (!PLATFORMS.includes(platform)) {
        res.status(400).json({ error: { message: `Invalid platform '${platform}'` } });
        return;
    }
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: { message: 'enabled must be a boolean' } });
        return;
    }
    const db = getDb();
    const result = db.prepare('UPDATE api_keys SET enabled = ? WHERE platform = ?').run(enabled ? 1 : 0, platform);
    res.json({ success: true, enabled, updatedKeys: result.changes });
});
// Toggle enable/disable
keysRouter.patch('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: { message: 'Invalid key ID' } });
        return;
    }
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: { message: 'enabled must be a boolean' } });
        return;
    }
    const db = getDb();
    const result = db.prepare('UPDATE api_keys SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    if (result.changes === 0) {
        res.status(404).json({ error: { message: 'Key not found' } });
        return;
    }
    res.json({ success: true, enabled });
});
//# sourceMappingURL=keys.js.map