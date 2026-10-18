import { openDb } from './db';
import { reset, seed } from './seed';

try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

const db = openDb(process.env.DB_FILE ?? 'data/tasklane.db');
reset(db);
seed(db);
console.log('Database reset with demo data.');
