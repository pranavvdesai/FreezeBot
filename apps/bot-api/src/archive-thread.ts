import { buildThreadBundle, type BundleBuilderInput, type TweetBundle } from 'archiver';
import { storeArchiveRecord } from 'indexer';
import { uploadArchiveBundleToStoracha, type StorachaUploadResult } from 'storage-w3up';
import { fetchThreadForTweet, type NormalizedThread } from 'x-client';

type ArchiveThreadInput = {
  mentionTweetId: string;
  targetTweetId: string;
};

type ArchiveThreadDependencies = {
  fetchThreadForTweetFn?: (targetTweetId: string) => Promise<NormalizedThread>;
  buildThreadBundleFn?: (
    input: {
      targetTweetId: string;
      tweets: BundleBuilderInput[];
    },
    options?: {
      rawSnapshot?: unknown;
      archivedAt?: string;
    }
  ) => TweetBundle;
  uploadArchiveBundleFn?: (bundle: Record<string, unknown>) => Promise<StorachaUploadResult>;
  storeArchiveRecordFn?: (record: {
    targetTweetId: string;
    mentionTweetId: string;
    cid: string;
    archivedAt: string;
    platform: 'x';
    command: 'archive';
    mode: 'thread';
    archiveMetadata: unknown;
  }) => Promise<void>;
  now?: () => string;
};

export type ArchiveThreadResult = {
  cid: string;
  archivedAt: string;
  bundle: TweetBundle;
};

export async function archiveThread(
  input: ArchiveThreadInput,
  dependencies: ArchiveThreadDependencies = {}
): Promise<ArchiveThreadResult> {
  const archivedAt = dependencies.now?.() ?? new Date().toISOString();
  const fetchThreadForTweetFn = dependencies.fetchThreadForTweetFn ?? fetchThreadForTweet;
  const buildThreadBundleFn = dependencies.buildThreadBundleFn ?? buildThreadBundle;
  const uploadArchiveBundleFn =
    dependencies.uploadArchiveBundleFn ?? uploadArchiveBundleToStoracha;
  const storeArchiveRecordFn = dependencies.storeArchiveRecordFn ?? storeArchiveRecord;

  const thread = await fetchThreadForTweetFn(input.targetTweetId);
  const bundle = buildThreadBundleFn(
    {
      targetTweetId: input.targetTweetId,
      tweets: thread.tweets
    },
    {
      archivedAt,
      rawSnapshot: thread
    }
  );
  const uploadResult = await uploadArchiveBundleFn(bundle);

  await storeArchiveRecordFn({
    targetTweetId: input.targetTweetId,
    mentionTweetId: input.mentionTweetId,
    cid: uploadResult.cid,
    archivedAt,
    platform: 'x',
    command: 'archive',
    mode: 'thread',
    archiveMetadata: bundle['bundle.json']
  });

  return {
    cid: uploadResult.cid,
    archivedAt,
    bundle
  };
}
