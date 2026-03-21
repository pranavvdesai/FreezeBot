import { describe, expect, it, vi } from 'vitest';
import { archiveThread } from './archive-thread';

describe('archiveThread', () => {
  it('fetches, builds, uploads, and stores a thread archive', async () => {
    const fetchThreadForTweetFn = vi.fn().mockResolvedValue({
      mode: 'thread',
      targetTweetId: 'target-2',
      rootTweetId: 'root-1',
      conversationId: 'root-1',
      tweets: [
        {
          tweetId: 'root-1',
          authorId: 'author-1',
          authorHandle: 'freezeuser',
          text: 'Part 1',
          createdAt: '2026-03-21T10:00:00.000Z',
          conversationId: 'root-1',
          referencedTweets: [],
          media: [],
          entities: {}
        },
        {
          tweetId: 'target-2',
          authorId: 'author-1',
          authorHandle: 'freezeuser',
          text: 'Part 2',
          createdAt: '2026-03-21T10:01:00.000Z',
          conversationId: 'root-1',
          referencedTweets: [{ id: 'root-1', type: 'replied_to' }],
          media: [],
          entities: {}
        }
      ]
    });
    const buildThreadBundleFn = vi.fn().mockReturnValue({
      'bundle.json': {
        schema: 'freeze/v1',
        source: { mode: 'thread' }
      }
    });
    const uploadArchiveBundleFn = vi.fn().mockResolvedValue({
      cid: 'bafythreadcid',
      uploadedAt: '2026-03-21T10:02:00.000Z',
      byteLength: 256
    });
    const storeArchiveRecordFn = vi.fn().mockResolvedValue(undefined);

    const result = await archiveThread(
      {
        mentionTweetId: 'mention-123',
        targetTweetId: 'target-2'
      },
      {
        fetchThreadForTweetFn,
        buildThreadBundleFn,
        uploadArchiveBundleFn,
        storeArchiveRecordFn,
        now: () => '2026-03-21T10:02:00.000Z'
      }
    );

    expect(fetchThreadForTweetFn).toHaveBeenCalledWith('target-2');
    expect(storeArchiveRecordFn).toHaveBeenCalledWith({
      targetTweetId: 'target-2',
      mentionTweetId: 'mention-123',
      cid: 'bafythreadcid',
      archivedAt: '2026-03-21T10:02:00.000Z',
      platform: 'x',
      command: 'archive',
      mode: 'thread',
      archiveMetadata: {
        schema: 'freeze/v1',
        source: { mode: 'thread' }
      }
    });
    expect(result.cid).toBe('bafythreadcid');
  });
});
