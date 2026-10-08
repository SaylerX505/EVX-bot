import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const MIGRATION_LOCK_KEY = 4_539_992;

export async function runMigrations(): Promise<void> {
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[migration] no SQL migrations found');
    return;
  }

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // Serialize migration runners so two bot instances cannot apply the same migration concurrently.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockAcquired = true;

    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (' +
        'id text PRIMARY KEY, ' +
        'applied_at timestamptz NOT NULL DEFAULT now()' +
        ')',
    );

    for (const file of files) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE id = $1',
        [file],
      );

      if (existing.rowCount) {
        continue;
      }

      const sql = await readFile(join(directory, file), 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(id) VALUES($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log('[migration] applied ' + file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
    client.release();
  }
}
