import { describe, expect, it, vi } from 'vitest';
import { archiveThread } from './archive-thread';
import { ArchiveFlowError } from './archive-errors';

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
      tweetId: 'target-2',
      conversationId: 'root-1',
      mentionTweetId: 'mention-123',
      cid: 'bafythreadcid',
      status: 'archived',
      createdAt: '2026-03-21T10:02:00.000Z',
      updatedAt: '2026-03-21T10:02:00.000Z',
      mode: 'thread',
      archiveMetadata: {
        schema: 'freeze/v1',
        source: { mode: 'thread' }
      }
    });
    expect(result.cid).toBe('bafythreadcid');
  });

  it('maps thread upload failures to a user friendly archive error', async () => {
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
        }
      ]
    });
    const uploadArchiveBundleFn = vi.fn().mockRejectedValue(new Error('upload failed'));

    await expect(
      archiveThread(
        {
          mentionTweetId: 'mention-123',
          targetTweetId: 'target-2'
        },
        {
          fetchThreadForTweetFn,
          uploadArchiveBundleFn
        }
      )
    ).rejects.toMatchObject({
      code: 'upload_failed',
      stage: 'upload',
      userMessage: 'Archive upload failed, please try again'
    });
  });
});
