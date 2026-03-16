import { describe, expect, it, vi } from 'vitest';
import { archiveSingleTweet } from './archive-single-tweet';

describe('archiveSingleTweet', () => {
  it('fetches, builds, uploads, and stores a single tweet archive', async () => {
    const fetchTargetTweetFn = vi.fn().mockResolvedValue({
      tweetId: 'target-123',
      authorId: 'author-1',
      authorHandle: 'freezeuser',
      text: 'Freeze this',
      createdAt: '2026-03-17T10:00:00.000Z',
      conversationId: 'target-123',
      referencedTweets: [],
      media: [],
      entities: {}
    });
    const buildSingleTweetBundleFn = vi.fn().mockReturnValue({
      'bundle.json': {
        schema: 'freeze/v1'
      }
    });
    const uploadArchiveBundleFn = vi.fn().mockResolvedValue({
      cid: 'bafytestcid',
      uploadedAt: '2026-03-17T10:01:00.000Z',
      byteLength: 128
    });
    const storeArchiveRecordFn = vi.fn().mockResolvedValue(undefined);

    const result = await archiveSingleTweet(
      {
        mentionTweetId: 'mention-123',
        targetTweetId: 'target-123'
      },
      {
        fetchTargetTweetFn,
        buildSingleTweetBundleFn,
        uploadArchiveBundleFn,
        storeArchiveRecordFn,
        now: () => '2026-03-17T10:01:00.000Z'
      }
    );

    expect(fetchTargetTweetFn).toHaveBeenCalledWith('target-123');
    expect(uploadArchiveBundleFn).toHaveBeenCalledWith({
      'bundle.json': {
        schema: 'freeze/v1'
      }
    });
    expect(storeArchiveRecordFn).toHaveBeenCalledWith({
      targetTweetId: 'target-123',
      mentionTweetId: 'mention-123',
      cid: 'bafytestcid',
      archivedAt: '2026-03-17T10:01:00.000Z',
      platform: 'x',
      command: 'archive',
      mode: 'single',
      archiveMetadata: {
        schema: 'freeze/v1'
      }
    });
    expect(result.cid).toBe('bafytestcid');
  });
});
