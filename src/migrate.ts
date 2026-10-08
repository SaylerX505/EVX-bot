import { closeDatabase } from './db.js';
import { runMigrations } from './migrations.js';

async function main(): Promise<void> {
  await runMigrations();
}

main()
  .catch((error) => {
    console.error('[migration]', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
