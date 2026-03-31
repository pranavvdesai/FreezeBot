import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArchiveStore } from './index';

describe('archive indexer', () => {
  let tempDirectory: string;
  let databasePath: string;
  let archiveStore: Awaited<ReturnType<typeof createArchiveStore>>;

  beforeEach(async () => {
    tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'freezebot-indexer-'));
    databasePath = path.join(tempDirectory, 'archive-index.sqlite');
    archiveStore = await createArchiveStore({ databasePath });
  });

  afterEach(async () => {
    await archiveStore.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('applies migrations before storing archive records', async () => {
    const appliedMigrations = await archiveStore.getAppliedMigrations();

    expect(appliedMigrations.map((migration) => migration.id)).toEqual([
      '001_create_tweet_archives.sql'
    ]);

    const stored = await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-1',
      conversationId: 'conversation-1',
      cid: 'bafytestcid',
      status: 'archived',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      mentionTweetId: 'mention-1',
      mode: 'single',
      archiveMetadata: { text: 'hello' }
    });

    expect(stored).toEqual({
      tweetId: 'tweet-1',
      conversationId: 'conversation-1',
      cid: 'bafytestcid',
      status: 'archived',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      mentionTweetId: 'mention-1',
      mode: 'single',
      archiveMetadata: { text: 'hello' }
    });
  });

  it('handles duplicate inserts safely with an upsert', async () => {
    await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-1',
      conversationId: 'conversation-1',
      cid: 'bafyfirst',
      status: 'archived',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      mode: 'single'
    });

    const updated = await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-1',
      conversationId: 'conversation-1',
      cid: 'bafysecond',
      status: 'archived',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T11:00:00.000Z',
      mode: 'thread'
    });

    expect(updated).toEqual({
      tweetId: 'tweet-1',
      conversationId: 'conversation-1',
      cid: 'bafysecond',
      status: 'archived',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T11:00:00.000Z',
      mentionTweetId: undefined,
      mode: 'thread',
      archiveMetadata: undefined
    });
  });

  it('returns archive status by tweet id', async () => {
    await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-2',
      conversationId: 'conversation-2',
      cid: 'bafystatus',
      status: 'archived',
      createdAt: '2026-03-30T12:00:00.000Z',
      updatedAt: '2026-03-30T12:00:00.000Z',
      mode: 'single'
    });

    await expect(archiveStore.getArchiveStatus('tweet-2')).resolves.toEqual({
      tweetId: 'tweet-2',
      conversationId: 'conversation-2',
      cid: 'bafystatus',
      status: 'archived',
      createdAt: '2026-03-30T12:00:00.000Z',
      updatedAt: '2026-03-30T12:00:00.000Z',
      mode: 'single'
    });
  });

  it('finds recover records by tweet id or conversation id', async () => {
    await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-root',
      conversationId: 'conversation-3',
      cid: 'bafyroot',
      status: 'archived',
      createdAt: '2026-03-30T09:00:00.000Z',
      updatedAt: '2026-03-30T09:00:00.000Z',
      mode: 'thread'
    });

    await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-latest',
      conversationId: 'conversation-3',
      cid: 'bafylatest',
      status: 'archived',
      createdAt: '2026-03-30T09:05:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      mode: 'thread'
    });

    await expect(
      archiveStore.findArchiveForRecover({ tweetId: 'tweet-root' })
    ).resolves.toMatchObject({
      tweetId: 'tweet-root',
      cid: 'bafyroot'
    });

    await expect(
      archiveStore.findArchiveForRecover({ conversationId: 'conversation-3' })
    ).resolves.toMatchObject({
      tweetId: 'tweet-latest',
      cid: 'bafylatest'
    });
  });

  it('does not expose failed archives for status, recover, or getArchiveRecord', async () => {
    const storedFailed = await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-failed',
      conversationId: 'conversation-fail',
      cid: 'bafybroken',
      status: 'failed',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      mode: 'single'
    });

    expect(storedFailed.status).toBe('failed');

    await expect(archiveStore.getArchiveRecord('tweet-failed')).resolves.toBeNull();
    await expect(archiveStore.getArchiveStatus('tweet-failed')).resolves.toBeNull();
    await expect(
      archiveStore.findArchiveForRecover({ tweetId: 'tweet-failed' })
    ).resolves.toBeNull();
    await expect(
      archiveStore.findArchiveForRecover({ conversationId: 'conversation-fail' })
    ).resolves.toBeNull();
  });

  it('recover by conversation ignores failed rows and returns the latest archived row', async () => {
    await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-fail-only',
      conversationId: 'conversation-mix',
      cid: 'bafyfail',
      status: 'failed',
      createdAt: '2026-03-30T09:00:00.000Z',
      updatedAt: '2026-03-30T09:00:00.000Z',
      mode: 'single'
    });

    await archiveStore.storeArchiveRecord({
      tweetId: 'tweet-ok',
      conversationId: 'conversation-mix',
      cid: 'bafygood',
      status: 'archived',
      createdAt: '2026-03-30T09:10:00.000Z',
      updatedAt: '2026-03-30T11:00:00.000Z',
      mode: 'single'
    });

    await expect(
      archiveStore.findArchiveForRecover({ conversationId: 'conversation-mix' })
    ).resolves.toMatchObject({
      tweetId: 'tweet-ok',
      cid: 'bafygood'
    });
  });
});
