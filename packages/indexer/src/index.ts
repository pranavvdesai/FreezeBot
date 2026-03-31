import {
  type CreateDatabaseSessionOptions,
  type DatabaseSession,
  defaultDatabasePath,
  createDatabaseSession,
  getBindVariable
} from './db';
import { type AppliedMigration, applyMigrations } from './migrations';

export type ArchiveStatus = 'archived' | 'failed';
export type ArchiveMode = 'single' | 'thread';

export type ArchiveRecord = {
  tweetId: string;
  conversationId: string;
  cid: string;
  status: ArchiveStatus;
  createdAt: string;
  updatedAt: string;
  mentionTweetId?: string;
  mode?: ArchiveMode;
  archiveMetadata?: unknown;
};

export type ArchiveStatusRecord = Pick<
  ArchiveRecord,
  'tweetId' | 'conversationId' | 'cid' | 'status' | 'createdAt' | 'updatedAt' | 'mode'
>;

export type RecoverLookupParams = {
  tweetId?: string;
  conversationId?: string;
};

export type CreateArchiveStoreOptions = CreateDatabaseSessionOptions & {
  session?: DatabaseSession;
  migrationsDirectory?: string;
};

export type ArchiveStore = {
  ensureMigrations(): Promise<AppliedMigration[]>;
  getAppliedMigrations(): Promise<AppliedMigration[]>;
  storeArchiveRecord(record: ArchiveRecord): Promise<ArchiveRecord>;
  getArchiveRecord(tweetId: string): Promise<ArchiveRecord | null>;
  getArchiveStatus(tweetId: string): Promise<ArchiveStatusRecord | null>;
  findArchiveForRecover(params: RecoverLookupParams): Promise<ArchiveRecord | null>;
  isWebhookMentionProcessed(mentionTweetId: string): Promise<boolean>;
  recordWebhookMentionProcessed(mentionTweetId: string): Promise<void>;
  clearArchiveRecords(): Promise<void>;
  close(): Promise<void>;
};

type ArchiveRow = {
  tweet_id: string;
  conversation_id: string;
  cid: string;
  status: ArchiveStatus;
  created_at: string;
  updated_at: string;
  mention_tweet_id: string | null;
  mode: ArchiveMode | null;
  archive_metadata: string | null;
};

let defaultStorePromise: Promise<ArchiveStore> | null = null;

export async function createArchiveStore(
  options: CreateArchiveStoreOptions = {}
): Promise<ArchiveStore> {
  const session = options.session ?? (await createDatabaseSession(options));

  const ensureMigrations = () =>
    applyMigrations(session, {
      migrationsDirectory: options.migrationsDirectory
    });

  await ensureMigrations();

  const store: ArchiveStore = {
    ensureMigrations,
    async getAppliedMigrations() {
      return (await session.all<{ id: string; applied_at: string }>(
        'SELECT id, applied_at FROM schema_migrations ORDER BY id ASC'
      )).map((row) => ({
        id: row.id,
        appliedAt: row.applied_at
      }));
    },
    async storeArchiveRecord(record) {
      const bind = (index: number) => getBindVariable(session.dialect, index);
      await session.run(
        `
          INSERT INTO tweet_archives (
            tweet_id,
            conversation_id,
            cid,
            status,
            created_at,
            updated_at,
            mention_tweet_id,
            mode,
            archive_metadata
          )
          VALUES (
            ${bind(1)},
            ${bind(2)},
            ${bind(3)},
            ${bind(4)},
            ${bind(5)},
            ${bind(6)},
            ${bind(7)},
            ${bind(8)},
            ${bind(9)}
          )
          ON CONFLICT(tweet_id) DO UPDATE SET
            conversation_id = excluded.conversation_id,
            cid = excluded.cid,
            status = excluded.status,
            updated_at = excluded.updated_at,
            mention_tweet_id = excluded.mention_tweet_id,
            mode = excluded.mode,
            archive_metadata = excluded.archive_metadata
        `,
        [
          record.tweetId,
          record.conversationId,
          record.cid,
          record.status,
          record.createdAt,
          record.updatedAt,
          record.mentionTweetId ?? null,
          record.mode ?? null,
          record.archiveMetadata ? JSON.stringify(record.archiveMetadata) : null
        ]
      );

      const storedRecord = await store.getArchiveRecord(record.tweetId);
      if (!storedRecord) {
        throw new Error('Failed to store archive record');
      }

      return storedRecord;
    },
    async getArchiveRecord(tweetId) {
      const bind1 = getBindVariable(session.dialect, 1);
      const row = await session.get<ArchiveRow>(
        `
          SELECT
            tweet_id,
            conversation_id,
            cid,
            status,
            created_at,
            updated_at,
            mention_tweet_id,
            mode,
            archive_metadata
          FROM tweet_archives
          WHERE tweet_id = ${bind1}
        `,
        [tweetId]
      );

      return row ? mapArchiveRow(row) : null;
    },
    async getArchiveStatus(tweetId) {
      const bind1 = getBindVariable(session.dialect, 1);
      const row = await session.get<ArchiveRow>(
        `
          SELECT
            tweet_id,
            conversation_id,
            cid,
            status,
            created_at,
            updated_at,
            mention_tweet_id,
            mode,
            archive_metadata
          FROM tweet_archives
          WHERE tweet_id = ${bind1}
        `,
        [tweetId]
      );

      if (!row) {
        return null;
      }

      const archiveRecord = mapArchiveRow(row);
      return {
        tweetId: archiveRecord.tweetId,
        conversationId: archiveRecord.conversationId,
        cid: archiveRecord.cid,
        status: archiveRecord.status,
        createdAt: archiveRecord.createdAt,
        updatedAt: archiveRecord.updatedAt,
        mode: archiveRecord.mode
      };
    },
    async findArchiveForRecover(params) {
      if (params.tweetId) {
        const directMatch = await store.getArchiveRecord(params.tweetId);
        if (directMatch) {
          return directMatch;
        }
      }

      if (!params.conversationId) {
        return null;
      }

      const bind1 = getBindVariable(session.dialect, 1);
      const row = await session.get<ArchiveRow>(
        `
          SELECT
            tweet_id,
            conversation_id,
            cid,
            status,
            created_at,
            updated_at,
            mention_tweet_id,
            mode,
            archive_metadata
          FROM tweet_archives
          WHERE conversation_id = ${bind1}
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [params.conversationId]
      );

      return row ? mapArchiveRow(row) : null;
    },
    async isWebhookMentionProcessed(mentionTweetId) {
      const bind1 = getBindVariable(session.dialect, 1);
      const row = await session.get<{ one: number }>(
        `
          SELECT 1 AS one
          FROM webhook_mention_idempotency
          WHERE mention_tweet_id = ${bind1}
          LIMIT 1
        `,
        [mentionTweetId]
      );
      return Boolean(row);
    },
    async recordWebhookMentionProcessed(mentionTweetId) {
      const now = new Date().toISOString();
      if (session.dialect === 'postgres') {
        const bind1 = getBindVariable(session.dialect, 1);
        const bind2 = getBindVariable(session.dialect, 2);
        await session.run(
          `
            INSERT INTO webhook_mention_idempotency (mention_tweet_id, processed_at)
            VALUES (${bind1}, ${bind2})
            ON CONFLICT (mention_tweet_id) DO NOTHING
          `,
          [mentionTweetId, now]
        );
        return;
      }

      const bind1 = getBindVariable(session.dialect, 1);
      const bind2 = getBindVariable(session.dialect, 2);
      await session.run(
        `
          INSERT OR IGNORE INTO webhook_mention_idempotency (mention_tweet_id, processed_at)
          VALUES (${bind1}, ${bind2})
        `,
        [mentionTweetId, now]
      );
    },
    async clearArchiveRecords() {
      await session.run('DELETE FROM tweet_archives');
    },
    async close() {
      await session.close();
    }
  };

  return store;
}

export async function storeArchiveRecord(record: ArchiveRecord) {
  return (await getDefaultStore()).storeArchiveRecord(record);
}

export async function getArchiveRecord(tweetId: string) {
  return (await getDefaultStore()).getArchiveRecord(tweetId);
}

export async function getArchiveStatus(tweetId: string) {
  return (await getDefaultStore()).getArchiveStatus(tweetId);
}

export async function findArchiveForRecover(params: RecoverLookupParams) {
  return (await getDefaultStore()).findArchiveForRecover(params);
}

export async function clearArchiveRecords() {
  return (await getDefaultStore()).clearArchiveRecords();
}

export async function isWebhookMentionProcessed(mentionTweetId: string) {
  return (await getDefaultStore()).isWebhookMentionProcessed(mentionTweetId);
}

export async function recordWebhookMentionProcessed(mentionTweetId: string) {
  return (await getDefaultStore()).recordWebhookMentionProcessed(mentionTweetId);
}

async function getDefaultStore() {
  if (!defaultStorePromise) {
    defaultStorePromise = createArchiveStore();
  }

  return defaultStorePromise;
}

function mapArchiveRow(row: ArchiveRow): ArchiveRecord {
  return {
    tweetId: row.tweet_id,
    conversationId: row.conversation_id,
    cid: row.cid,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mentionTweetId: row.mention_tweet_id ?? undefined,
    mode: row.mode ?? undefined,
    archiveMetadata: row.archive_metadata ? JSON.parse(row.archive_metadata) : undefined
  };
}

export { createDatabaseSession, defaultDatabasePath, type DatabaseSession };
export { applyMigrations, type AppliedMigration };
export type { SqlDialect } from './db';
