import { describe, expect, it, vi } from 'vitest';
import { fetchThreadForTweet } from './fetch-thread';

function createTweetResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('fetchThreadForTweet', () => {
  it('loads the parent chain and same-author thread tweets', async () => {
    const fetchFn = vi.fn(async (input: string) => {
      if (input.includes('/2/tweets/target-2?')) {
        return createTweetResponse({
          data: {
            id: 'target-2',
            author_id: 'author-1',
            text: 'Part 2',
            created_at: '2026-03-21T10:01:00.000Z',
            conversation_id: 'root-1',
            referenced_tweets: [{ id: 'root-1', type: 'replied_to' }]
          },
          includes: {
            users: [{ id: 'author-1', username: 'freezeuser' }]
          }
        });
      }

      if (input.includes('/2/tweets/root-1?')) {
        return createTweetResponse({
          data: {
            id: 'root-1',
            author_id: 'author-1',
            text: 'Part 1',
            created_at: '2026-03-21T10:00:00.000Z',
            conversation_id: 'root-1',
            referenced_tweets: []
          },
          includes: {
            users: [{ id: 'author-1', username: 'freezeuser' }]
          }
        });
      }

      if (input.includes('/2/tweets/search/recent?')) {
        return createTweetResponse({
          data: [
            {
              id: 'root-1',
              author_id: 'author-1',
              text: 'Part 1',
              created_at: '2026-03-21T10:00:00.000Z',
              conversation_id: 'root-1',
              referenced_tweets: []
            },
            {
              id: 'target-2',
              author_id: 'author-1',
              text: 'Part 2',
              created_at: '2026-03-21T10:01:00.000Z',
              conversation_id: 'root-1',
              referenced_tweets: [{ id: 'root-1', type: 'replied_to' }]
            },
            {
              id: 'target-3',
              author_id: 'author-1',
              text: 'Part 3',
              created_at: '2026-03-21T10:02:00.000Z',
              conversation_id: 'root-1',
              referenced_tweets: [{ id: 'target-2', type: 'replied_to' }]
            }
          ],
          includes: {
            users: [{ id: 'author-1', username: 'freezeuser' }]
          }
        });
      }

      throw new Error(`Unhandled URL: ${input}`);
    });

    const thread = await fetchThreadForTweet('target-2', {
      bearerToken: 'token',
      fetchFn,
      baseUrl: 'https://api.x.com'
    });

    expect(thread.mode).toBe('thread');
    expect(thread.rootTweetId).toBe('root-1');
    expect(thread.targetTweetId).toBe('target-2');
    expect(thread.tweets.map((tweet) => tweet.tweetId)).toEqual(['root-1', 'target-2', 'target-3']);
  });

  it('returns a thread with only target tweet when author handle is unavailable', async () => {
    const fetchFn = vi.fn(async (input: string) => {
      if (input.includes('/2/tweets/solo-1?')) {
        return createTweetResponse({
          data: {
            id: 'solo-1',
            author_id: 'author-1',
            text: 'Standalone',
            created_at: '2026-03-21T10:00:00.000Z',
            conversation_id: 'solo-1',
            referenced_tweets: []
          }
        });
      }

      throw new Error(`Unhandled URL: ${input}`);
    });

    const thread = await fetchThreadForTweet('solo-1', {
      bearerToken: 'token',
      fetchFn
    });

    expect(thread.tweets.map((tweet) => tweet.tweetId)).toEqual(['solo-1']);
  });
});
