import { beforeEach, describe, expect, it } from 'vitest';
import { clearArchiveRecords, getArchiveRecord, storeArchiveRecord } from './index';

describe('archive indexer', () => {
  beforeEach(() => {
    clearArchiveRecords();
  });

  it('stores and returns archive metadata by target tweet id', async () => {
    await storeArchiveRecord({
      targetTweetId: 'target-1',
      mentionTweetId: 'mention-1',
      cid: 'bafytestcid',
      archivedAt: '2026-03-17T10:00:00.000Z',
      platform: 'x',
      command: 'archive',
      mode: 'single',
      archiveMetadata: { text: 'hello' }
    });

    await expect(getArchiveRecord('target-1')).resolves.toEqual({
      targetTweetId: 'target-1',
      mentionTweetId: 'mention-1',
      cid: 'bafytestcid',
      archivedAt: '2026-03-17T10:00:00.000Z',
      platform: 'x',
      command: 'archive',
      mode: 'single',
      archiveMetadata: { text: 'hello' }
    });
  });
});
