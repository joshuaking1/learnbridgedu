// services/analytics-service/run-migration.ts
import { Pool } from 'pg';
import { logger } from '../shared/logger';
import path from 'path';
import fs from 'fs';

async function runMigration() {
  const pool = new Pool({
    host: 'aws-0-eu-central-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.aiqjlswgllzbbtjugmqd',
    password: 'Er8c7J4eNTmArpwb',
    database: 'postgres',
    ssl: {
      rejectUnauthorized: false
    }
  });

  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query('BEGIN');

    // Read and execute migration files
    const migrationFiles = fs
      .readdirSync(path.join(__dirname, 'migrations'))
      .sort();

    for (const file of migrationFiles) {
      logger.info(`Running migration: ${file}`);
      const migration = fs.readFileSync(
        path.join(__dirname, 'migrations', file),
        'utf8'
      );
      await client.query(migration);
    }

    // Commit transaction
    await client.query('COMMIT');
    logger.info('Migrations completed successfully');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((error) => {
  logger.error('Migration error:', error);
  process.exit(1);
});