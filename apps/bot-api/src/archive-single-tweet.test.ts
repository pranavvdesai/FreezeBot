import { describe, expect, it, vi } from 'vitest';
import { archiveSingleTweet } from './archive-single-tweet';
import { XClientError } from 'x-client';
import { ArchiveFlowError } from './archive-errors';

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
      tweetId: 'target-123',
      conversationId: 'target-123',
      mentionTweetId: 'mention-123',
      cid: 'bafytestcid',
      status: 'archived',
      createdAt: '2026-03-17T10:01:00.000Z',
      updatedAt: '2026-03-17T10:01:00.000Z',
      mode: 'single',
      archiveMetadata: {
        schema: 'freeze/v1'
      }
    });
    expect(result.cid).toBe('bafytestcid');
  });

  it('maps fetch failures to a user friendly archive error', async () => {
    const fetchTargetTweetFn = vi
      .fn()
      .mockRejectedValue(new XClientError('not found', { status: 404 }));

    await expect(
      archiveSingleTweet(
        {
          mentionTweetId: 'mention-123',
          targetTweetId: 'target-123'
        },
        {
          fetchTargetTweetFn
        }
      )
    ).rejects.toMatchObject({
      code: 'tweet_not_found',
      stage: 'fetch',
      userMessage: 'Tweet not found'
    });
  });

  it('maps upload failures to a user friendly archive error', async () => {
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
    const uploadArchiveBundleFn = vi.fn().mockRejectedValue(new Error('storacha down'));

    await expect(
      archiveSingleTweet(
        {
          mentionTweetId: 'mention-123',
          targetTweetId: 'target-123'
        },
        {
          fetchTargetTweetFn,
          uploadArchiveBundleFn
        }
      )
    ).rejects.toMatchObject({
      code: 'upload_failed',
      stage: 'upload',
      userMessage: 'Archive upload failed, please try again'
    });
  });

  it('maps db write failures to a user friendly archive error', async () => {
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
    const uploadArchiveBundleFn = vi.fn().mockResolvedValue({
      cid: 'bafytestcid',
      uploadedAt: '2026-03-17T10:01:00.000Z',
      byteLength: 128
    });
    const storeArchiveRecordFn = vi.fn().mockRejectedValue(new Error('db down'));

    await expect(
      archiveSingleTweet(
        {
          mentionTweetId: 'mention-123',
          targetTweetId: 'target-123'
        },
        {
          fetchTargetTweetFn,
          uploadArchiveBundleFn,
          storeArchiveRecordFn
        }
      )
    ).rejects.toMatchObject({
      code: 'db_write_failed',
      stage: 'store',
      userMessage: 'Archive save failed, please try again'
    });
  });
});
