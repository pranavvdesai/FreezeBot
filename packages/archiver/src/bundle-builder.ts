import {
  ArchivedTweetDocumentV1,
  FREEZE_ARCHIVE_SCHEMA_V1,
  X_PLATFORM,
  ArchivedTweetRecord,
  ArchivedThreadRecord,
  TextEntities
} from './archive-schema';

export type BundleBuilderInput = {
  tweetId: string;
  authorId?: string;
  authorHandle?: string;
  text: string;
  createdAt: string;
  conversationId: string;
  referencedTweets: Array<{ id: string; type: string }>;
  media: Array<{
    mediaKey: string;
    type: string;
    url?: string;
    previewImageUrl?: string;
    width?: number;
    height?: number;
    durationMs?: number;
    altText?: string;
  }>;
  entities?: {
    urls?: Array<{
      url: string;
      expanded_url?: string;
      display_url?: string;
      title?: string;
    }>;
    mentions?: Array<{
      username: string;
      id?: string;
    }>;
    hashtags?: Array<{
      tag: string;
    }>;
    cashtags?: Array<{
      tag: string;
    }>;
  };
};

export type MediaManifest = {
  media: Array<{
    mediaKey: string;
    fileName: string;
    contentType: string;
  }>;
};

export type TweetBundle = {
  'bundle.json': ArchivedTweetDocumentV1;
  'raw.json'?: unknown;
  'media-manifest.json'?: MediaManifest;
};

export function buildSingleTweetBundle(
  input: BundleBuilderInput,
  options: {
    rawSnapshot?: unknown;
    archivedAt?: string;
  } = {}
): TweetBundle {
  const archivedAt = options.archivedAt ?? new Date().toISOString();
  const tweetRecord = mapTweetRecord(input);

  const bundle: ArchivedTweetDocumentV1 = {
    schema: FREEZE_ARCHIVE_SCHEMA_V1,
    source: {
      platform: X_PLATFORM,
      tweetId: input.tweetId,
      archivedAt,
      mode: 'single'
    },
    tweet: tweetRecord,
    rawSnapshot: options.rawSnapshot
  };

  const result: TweetBundle = {
    'bundle.json': bundle
  };

  if (options.rawSnapshot) {
    result['raw.json'] = options.rawSnapshot;
  }

  if (input.media.length > 0) {
    result['media-manifest.json'] = {
      media: input.media.map((m) => ({
        mediaKey: m.mediaKey,
        // Placeholder file names for now
        fileName: `${m.mediaKey}.${getFileExtension(m.type)}`,
        contentType: getContentType(m.type)
      }))
    };
  }

  return result;
}

export type ThreadBundleBuilderInput = {
  targetTweetId: string;
  tweets: BundleBuilderInput[];
};

export function buildThreadBundle(
  input: ThreadBundleBuilderInput,
  options: {
    rawSnapshot?: unknown;
    archivedAt?: string;
  } = {}
): TweetBundle {
  if (input.tweets.length === 0) {
    throw new Error('Thread bundle requires at least one tweet');
  }

  const archivedAt = options.archivedAt ?? new Date().toISOString();
  const sortedTweets = [...input.tweets].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
  const tweetRecords = sortedTweets.map(mapTweetRecord);
  const targetTweetRecord =
    tweetRecords.find((tweet) => tweet.metadata.id === input.targetTweetId) ?? tweetRecords[0];
  const threadRecord: ArchivedThreadRecord = {
    rootTweetId: tweetRecords[0].metadata.id,
    tweets: tweetRecords
  };

  const bundle: ArchivedTweetDocumentV1 = {
    schema: FREEZE_ARCHIVE_SCHEMA_V1,
    source: {
      platform: X_PLATFORM,
      tweetId: input.targetTweetId,
      archivedAt,
      mode: 'thread'
    },
    tweet: targetTweetRecord,
    thread: threadRecord,
    rawSnapshot: options.rawSnapshot
  };

  const result: TweetBundle = {
    'bundle.json': bundle
  };

  if (options.rawSnapshot) {
    result['raw.json'] = options.rawSnapshot;
  }

  const media = input.tweets.flatMap((tweet) => tweet.media);
  if (media.length > 0) {
    result['media-manifest.json'] = {
      media: dedupeMedia(media).map((item) => ({
        mediaKey: item.mediaKey,
        fileName: `${item.mediaKey}.${getFileExtension(item.type)}`,
        contentType: getContentType(item.type)
      }))
    };
  }

  return result;
}

function mapTweetRecord(input: BundleBuilderInput): ArchivedTweetRecord {
  const entities: TextEntities = {
    urls: (input.entities?.urls ?? []).map((u) => ({
      shortUrl: u.url,
      expandedUrl: u.expanded_url,
      displayUrl: u.display_url,
      title: u.title
    })),
    mentions: (input.entities?.mentions ?? []).map((m) => ({
      handle: m.username,
      id: m.id
    })),
    hashtags: (input.entities?.hashtags ?? []).map((h) => ({
      tag: h.tag
    })),
    cashtags: (input.entities?.cashtags ?? []).map((c) => ({
      tag: c.tag
    }))
  };

  return {
    metadata: {
      id: input.tweetId,
      createdAt: input.createdAt,
      conversationId: input.conversationId,
      references: input.referencedTweets
    },
    author: {
      id: input.authorId,
      handle: input.authorHandle
    },
    content: {
      text: input.text,
      entities
    },
    media: input.media.map((m) => ({
      mediaKey: m.mediaKey,
      type: m.type,
      url: m.url,
      previewImageUrl: m.previewImageUrl,
      width: m.width,
      height: m.height,
      durationMs: m.durationMs,
      altText: m.altText
    }))
  };
}

function dedupeMedia(media: BundleBuilderInput['media']) {
  const dedupedMedia = new Map<string, BundleBuilderInput['media'][number]>();

  for (const item of media) {
    dedupedMedia.set(item.mediaKey, item);
  }

  return [...dedupedMedia.values()];
}

function getFileExtension(type: string): string {
  switch (type) {
    case 'photo':
      return 'jpg';
    case 'video':
      return 'mp4';
    case 'animated_gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function getContentType(type: string): string {
  switch (type) {
    case 'photo':
      return 'image/jpeg';
    case 'video':
      return 'video/mp4';
    case 'animated_gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}
