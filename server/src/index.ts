import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { openDb } from './db';
import { isEmpty, seed } from './seed';

try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the real environment.
}

const isProd = process.env.NODE_ENV === 'production';
// `--port` wins over PORT so the dev script stays on 4000 even when a tool exports PORT for Vite.
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag > -1 ? process.argv[portFlag + 1] : (process.env.PORT ?? 4000));
const dbFile = process.env.DB_FILE ?? 'data/tasklane.db';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  jwtSecret = 'dev-only-secret-change-me';
  console.warn('JWT_SECRET is not set, using an insecure development secret.');
}

const db = openDb(dbFile);
if (process.env.SEED_DEMO !== 'false' && isEmpty(db)) {
  seed(db);
  console.log('Seeded demo workspace.');
}

const app = createApp(db, {
  jwtSecret,
  secureCookies: isProd,
  allowDemo: process.env.ALLOW_DEMO !== 'false',
  staticDir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
});

app.listen(port, () => {
  console.log(`Tasklane API listening on http://localhost:${port}`);
});
