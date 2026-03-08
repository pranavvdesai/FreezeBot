import { describe, expect, it, vi } from 'vitest';
import { XClientError, fetchTargetTweet } from './fetch-target-tweet';

describe('fetchTargetTweet', () => {
  it('returns a normalized tweet object', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: '111',
            author_id: '200',
            text: 'Hello FreezeBot',
            created_at: '2026-03-08T18:00:00.000Z',
            conversation_id: '111',
            referenced_tweets: [{ id: '109', type: 'replied_to' }],
            attachments: {
              media_keys: ['3_10']
            }
          },
          includes: {
            users: [{ id: '200', username: 'alice' }],
            media: [
              {
                media_key: '3_10',
                type: 'photo',
                url: 'https://pbs.twimg.com/media/a.jpg',
                width: 1200,
                height: 675
              }
            ]
          }
        }),
        { status: 200 }
      )
    );

    const result = await fetchTargetTweet('111', {
      bearerToken: 'token',
      fetchFn,
      baseUrl: 'https://api.x.com'
    });

    expect(result).toEqual({
      tweetId: '111',
      authorId: '200',
      authorHandle: 'alice',
      text: 'Hello FreezeBot',
      createdAt: '2026-03-08T18:00:00.000Z',
      conversationId: '111',
      referencedTweets: [{ id: '109', type: 'replied_to' }],
      media: [
        {
          mediaKey: '3_10',
          type: 'photo',
          url: 'https://pbs.twimg.com/media/a.jpg',
          previewImageUrl: undefined,
          width: 1200,
          height: 675,
          durationMs: undefined,
          altText: undefined
        }
      ]
    });
  });

  it('throws helpful error for non-200 response', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ title: 'Unauthorized' }), { status: 401 }));

    await expect(
      fetchTargetTweet('111', {
        bearerToken: 'bad-token',
        fetchFn
      })
    ).rejects.toMatchObject({
      name: 'XClientError',
      message: 'X API returned an error',
      status: 401
    });
  });

  it('throws when required tweet fields are missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: '111' } }), { status: 200 }));

    await expect(
      fetchTargetTweet('111', {
        bearerToken: 'token',
        fetchFn
      })
    ).rejects.toBeInstanceOf(XClientError);
  });
});
