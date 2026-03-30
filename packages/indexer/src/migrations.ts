import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSession, getBindVariable } from './db';

export type AppliedMigration = {
  id: string;
  appliedAt: string;
};

export async function applyMigrations(
  session: DatabaseSession,
  options: {
    migrationsDirectory?: string;
    now?: () => string;
  } = {}
): Promise<AppliedMigration[]> {
  const migrationsDirectory =
    options.migrationsDirectory ?? path.join(__dirname, '..', 'migrations');
  const now = options.now ?? (() => new Date().toISOString());

  await session.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedMigrationIds = new Set(
    (
      await session.all<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id ASC')
    ).map((row) => row.id)
  );

  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  for (const fileName of migrationFiles) {
    if (appliedMigrationIds.has(fileName)) {
      continue;
    }

    const sql = readFileSync(path.join(migrationsDirectory, fileName), 'utf8');
    await session.exec(sql);

    const appliedAt = now();
    const bind1 = getBindVariable(session.dialect, 1);
    const bind2 = getBindVariable(session.dialect, 2);
    await session.run(
      `INSERT INTO schema_migrations (id, applied_at) VALUES (${bind1}, ${bind2})`,
      [fileName, appliedAt]
    );
  }

  return (await session.all<{ id: string; applied_at: string }>(
    'SELECT id, applied_at FROM schema_migrations ORDER BY id ASC'
  )).map((row) => ({
    id: row.id,
    appliedAt: row.applied_at
  }));
}
