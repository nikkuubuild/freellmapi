import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');

// Only load .env file if it exists (hosting platforms inject env vars directly)
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
