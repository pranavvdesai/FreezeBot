import { describe, it, expect } from 'vitest';
import { buildSingleTweetBundle, buildThreadBundle, BundleBuilderInput } from './bundle-builder';

describe('BundleBuilder', () => {
  const mockInput: BundleBuilderInput = {
    tweetId: '12345',
    authorId: '6789',
    authorHandle: 'test_user',
    text: 'Hello, #FreezeBot!',
    createdAt: '2026-03-09T10:00:00Z',
    conversationId: '12345',
    referencedTweets: [],
    media: [
      {
        mediaKey: 'm1',
        type: 'photo',
        url: 'https://pbs.twimg.com/media/m1.jpg'
      }
    ],
    entities: {
      hashtags: [{ tag: 'FreezeBot' }]
    }
  };

  it('produces a stable archive structure for the same tweet', () => {
    const archivedAt = '2026-03-09T12:00:00Z';
    const bundle1 = buildSingleTweetBundle(mockInput, { archivedAt });
    const bundle2 = buildSingleTweetBundle(mockInput, { archivedAt });

    expect(bundle1).toEqual(bundle2);
    expect(JSON.stringify(bundle1)).toEqual(JSON.stringify(bundle2));
  });

  it('includes bundle.json, raw.json, and media-manifest.json when provided', () => {
    const rawSnapshot = { some: 'raw', data: 1 };
    const bundle = buildSingleTweetBundle(mockInput, { rawSnapshot });

    expect(bundle['bundle.json']).toBeDefined();
    expect(bundle['raw.json']).toEqual(rawSnapshot);
    expect(bundle['media-manifest.json']).toBeDefined();
    expect(bundle['media-manifest.json']?.media).toHaveLength(1);
    expect(bundle['media-manifest.json']?.media[0].fileName).toBe('m1.jpg');
  });

  it('maps NormalizedTweet to ArchivedTweetDocumentV1 correctly', () => {
    const bundle = buildSingleTweetBundle(mockInput, { archivedAt: '2026-03-09T12:00:00Z' });
    const archivedTweet = bundle['bundle.json'];

    expect(archivedTweet.schema).toBe('freeze/v1');
    expect(archivedTweet.source.tweetId).toBe('12345');
    expect(archivedTweet.tweet.content.text).toBe('Hello, #FreezeBot!');
    expect(archivedTweet.tweet.content.entities.hashtags[0].tag).toBe('FreezeBot');
    expect(archivedTweet.tweet.author.handle).toBe('test_user');
    expect(archivedTweet.tweet.media[0].mediaKey).toBe('m1');
  });

  it('handles empty optional fields', () => {
    const minimalInput: BundleBuilderInput = {
      tweetId: '1',
      text: 'min',
      createdAt: '2026-01-01T00:00:00Z',
      conversationId: '1',
      referencedTweets: [],
      media: []
    };

    const bundle = buildSingleTweetBundle(minimalInput);
    expect(bundle['bundle.json']).toBeDefined();
    expect(bundle['raw.json']).toBeUndefined();
    expect(bundle['media-manifest.json']).toBeUndefined();
  });

  it('builds a thread bundle with ordered tweet records', () => {
    const threadBundle = buildThreadBundle(
      {
        targetTweetId: '12346',
        tweets: [
          {
            tweetId: '12345',
            authorId: '6789',
            authorHandle: 'test_user',
            text: 'Thread start',
            createdAt: '2026-03-09T10:00:00Z',
            conversationId: '12345',
            referencedTweets: [],
            media: []
          },
          {
            tweetId: '12346',
            authorId: '6789',
            authorHandle: 'test_user',
            text: 'Thread second',
            createdAt: '2026-03-09T10:01:00Z',
            conversationId: '12345',
            referencedTweets: [{ id: '12345', type: 'replied_to' }],
            media: []
          }
        ]
      },
      { archivedAt: '2026-03-09T12:00:00Z' }
    );

    expect(threadBundle['bundle.json'].source.mode).toBe('thread');
    expect(threadBundle['bundle.json'].thread?.rootTweetId).toBe('12345');
    expect(threadBundle['bundle.json'].thread?.tweets).toHaveLength(2);
    expect(threadBundle['bundle.json'].tweet.metadata.id).toBe('12346');
  });
});
