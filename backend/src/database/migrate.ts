import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

function getMigrationsDir(): string {
  // Run from repository backend/ folder during local dev.
  return join(process.cwd(), 'src', 'database', 'migrations');
}

export async function runMigrations() {
  dotenv.config({ path: join(process.cwd(), '.env') });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    const migrationsDir = getMigrationsDir();
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query(sql);
      console.log(`Applied migration: ${file}`);
    }

    console.log(`Migration complete. Applied ${files.length} files.`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
