import './env.js';
import { createApp } from './app.js';
import { initDb } from './db/index.js';
import { startHealthChecker } from './services/health.js';

const PORT = process.env.PORT ?? 3001;

async function main() {
  await initDb();
  const app = createApp();

  const host = process.env.HOST || '0.0.0.0';
  app.listen(Number(PORT), host, () => {
    console.log(`Server running on http://${host}:${PORT}`);
    console.log(`Proxy endpoint: http://${host}:${PORT}/v1/chat/completions`);
    startHealthChecker();
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
