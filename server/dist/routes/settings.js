import { Router } from 'express';
import { getUnifiedApiKey, regenerateUnifiedKey } from '../db/index.js';
export const settingsRouter = Router();
// Get the unified API key
settingsRouter.get('/api-key', (_req, res) => {
    res.json({ apiKey: getUnifiedApiKey() });
});
// Regenerate the unified API key
settingsRouter.post('/api-key/regenerate', (_req, res) => {
    const newKey = regenerateUnifiedKey();
    res.json({ apiKey: newKey });
});
//# sourceMappingURL=settings.js.map