import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type SqlDialect = 'sqlite' | 'postgres';

export type DatabaseRow = Record<string, unknown>;

export type DatabaseSession = {
  dialect: SqlDialect;
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T extends DatabaseRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T extends DatabaseRow>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
};

type SqliteDatabaseSyncInstance = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): void;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

type PostgresClient = {
  connect(): Promise<void>;
  query<T extends DatabaseRow = DatabaseRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};

const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (databasePath: string) => SqliteDatabaseSyncInstance;
};

export type CreateDatabaseSessionOptions = {
  dialect?: SqlDialect;
  databasePath?: string;
  connectionString?: string;
};

export const defaultDatabasePath = path.join(process.cwd(), '.freezebot', 'archive-index.sqlite');

export async function createDatabaseSession(
  options: CreateDatabaseSessionOptions = {}
): Promise<DatabaseSession> {
  const dialect = resolveDialect(options);

  if (dialect === 'postgres') {
    const connectionString =
      options.connectionString ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for postgres');
    }

    return createPostgresSession(connectionString);
  }

  const databasePath =
    options.databasePath ?? process.env.ARCHIVE_INDEX_DB_PATH ?? defaultDatabasePath;
  return createSqliteSession(databasePath);
}

export function getBindVariable(dialect: SqlDialect, index: number) {
  return dialect === 'postgres' ? `$${index}` : '?';
}

function resolveDialect(options: CreateDatabaseSessionOptions) {
  if (options.dialect) {
    return options.dialect;
  }

  const configuredDialect = process.env.ARCHIVE_INDEX_DIALECT;
  if (configuredDialect === 'postgres' || configuredDialect === 'sqlite') {
    return configuredDialect;
  }

  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    return 'postgres';
  }

  return 'sqlite';
}

async function createPostgresSession(connectionString: string): Promise<DatabaseSession> {
  const { Client } = require('pg') as {
    Client: new (options: { connectionString: string }) => PostgresClient;
  };

  const client = new Client({ connectionString });
  await client.connect();

  return {
    dialect: 'postgres',
    async exec(sql) {
      await client.query(sql);
    },
    async run(sql, params = []) {
      await client.query(sql, params);
    },
    async get<T extends DatabaseRow>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params);
      return result.rows[0] as T | undefined;
    },
    async all<T extends DatabaseRow>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params);
      return result.rows;
    },
    async close() {
      await client.end();
    }
  };
}

async function createSqliteSession(databasePath: string): Promise<DatabaseSession> {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  return {
    dialect: 'sqlite',
    async exec(sql) {
      database.exec(sql);
    },
    async run(sql: string, params: unknown[] = []) {
      database.prepare(sql).run(...params);
    },
    async get<T extends DatabaseRow>(sql: string, params: unknown[] = []) {
      return database.prepare(sql).get(...params) as T | undefined;
    },
    async all<T extends DatabaseRow>(sql: string, params: unknown[] = []) {
      return database.prepare(sql).all(...params) as T[];
    },
    async close() {
      database.close();
    }
  };
}
