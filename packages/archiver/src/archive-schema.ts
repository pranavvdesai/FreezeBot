export const FREEZE_ARCHIVE_SCHEMA_V1 = 'freeze/v1' as const;
export const X_PLATFORM = 'x' as const;

export type FreezeArchiveSchemaVersion = typeof FREEZE_ARCHIVE_SCHEMA_V1;
export type SourcePlatform = typeof X_PLATFORM;
export type ArchiveContentMode = 'single' | 'thread';

export type TweetReference = {
  id: string;
  type: 'replied_to' | 'quoted' | 'retweeted' | string;
};

export type TweetMetadata = {
  id: string;
  createdAt: string;
  conversationId: string;
  lang?: string;
  references: TweetReference[];
};

export type AuthorMetadata = {
  id?: string;
  handle?: string;
  displayName?: string;
  verified?: boolean;
};

export type UrlEntity = {
  shortUrl: string;
  expandedUrl?: string;
  displayUrl?: string;
  title?: string;
};

export type MentionEntity = {
  handle: string;
  id?: string;
};

export type HashtagEntity = {
  tag: string;
};

export type CashtagEntity = {
  tag: string;
};

export type TextEntities = {
  urls: UrlEntity[];
  mentions: MentionEntity[];
  hashtags: HashtagEntity[];
  cashtags: CashtagEntity[];
};

export type MediaReference = {
  mediaKey: string;
  type: 'photo' | 'video' | 'animated_gif' | string;
  url?: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  altText?: string;
};

export type ArchivedTweetRecord = {
  metadata: TweetMetadata;
  author: AuthorMetadata;
  content: {
    text: string;
    entities: TextEntities;
  };
  media: MediaReference[];
};

export type ArchiveSource = {
  platform: SourcePlatform;
  tweetId: string;
  archivedAt: string;
  mode: ArchiveContentMode;
};

export type ArchivedTweetDocumentV1 = {
  schema: FreezeArchiveSchemaVersion;
  source: ArchiveSource;
  tweet: ArchivedTweetRecord;
  // Optional raw snapshot from X API response for audits and debugging.
  rawSnapshot?: unknown;
  // Reserved for future migration to multi-tweet/thread archives.
  extensions?: Record<string, unknown>;
};
