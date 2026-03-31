import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './server';
import { computeSignature } from './signature';

const secret = 'test-secret';

function signedHeader(body: unknown) {
  const rawBody = Buffer.from(JSON.stringify(body));
  return `sha256=${computeSignature(rawBody, secret)}`;
}

describe('archive pipeline integration', () => {
  it('runs the single tweet archive flow end to end with mocks', async () => {
    process.env.X_WEBHOOK_SECRET = secret;

    const fetchTargetTweetFn = vi.fn().mockResolvedValue({
      tweetId: 'tweet-100',
      authorId: 'author-1',
      authorHandle: 'freezeuser',
      text: 'hello from freeze',
      createdAt: '2026-03-30T10:00:00.000Z',
      conversationId: 'tweet-100',
      referencedTweets: [],
      media: [],
      entities: {}
    });
    const buildSingleTweetBundleFn = vi.fn().mockReturnValue({
      'bundle.json': {
        schema: 'freeze/v1',
        source: {
          platform: 'x',
          tweetId: 'tweet-100',
          archivedAt: '2026-03-30T10:01:00.000Z',
          mode: 'single'
        }
      }
    });
    const uploadArchiveBundleFn = vi.fn().mockResolvedValue({
      cid: 'bafyintegrationcid',
      uploadedAt: '2026-03-30T10:01:00.000Z',
      byteLength: 128
    });
    const storeArchiveRecordFn = vi.fn().mockResolvedValue({
      tweetId: 'tweet-100'
    });
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);

    const archiveSingleTweetFn = async ({
      mentionTweetId,
      targetTweetId
    }: {
      mentionTweetId: string;
      targetTweetId: string;
    }) => {
      const { archiveSingleTweet } = await import('./archive-single-tweet');

      return archiveSingleTweet(
        {
          mentionTweetId,
          targetTweetId
        },
        {
          fetchTargetTweetFn,
          buildSingleTweetBundleFn,
          uploadArchiveBundleFn,
          storeArchiveRecordFn,
          now: () => '2026-03-30T10:01:00.000Z'
        }
      );
    };

    const app = createApp({
      postReplyFn,
      archiveSingleTweetFn,
      getArchiveStatusFn
    });

    const payload = {
      mentionTweetId: 'mention-100',
      targetTweetId: 'tweet-100',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(getArchiveStatusFn).toHaveBeenCalledWith('tweet-100');
    expect(fetchTargetTweetFn).toHaveBeenCalledWith('tweet-100');
    expect(buildSingleTweetBundleFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tweetId: 'tweet-100',
        text: 'hello from freeze'
      }),
      expect.objectContaining({
        archivedAt: '2026-03-30T10:01:00.000Z'
      })
    );
    expect(uploadArchiveBundleFn).toHaveBeenCalledWith({
      'bundle.json': {
        schema: 'freeze/v1',
        source: {
          platform: 'x',
          tweetId: 'tweet-100',
          archivedAt: '2026-03-30T10:01:00.000Z',
          mode: 'single'
        }
      }
    });
    expect(storeArchiveRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tweetId: 'tweet-100',
        conversationId: 'tweet-100',
        cid: 'bafyintegrationcid',
        status: 'archived'
      })
    );
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-100',
      'Archived successfully ✅\nCID: bafyintegrationcid'
    );
    expect(response.body).toMatchObject({
      ok: true,
      cid: 'bafyintegrationcid',
      repliedTo: 'mention-100'
    });
  });
});
