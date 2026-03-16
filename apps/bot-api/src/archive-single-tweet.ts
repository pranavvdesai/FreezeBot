import { buildSingleTweetBundle, type BundleBuilderInput, type TweetBundle } from 'archiver';
import { storeArchiveRecord } from 'indexer';
import { uploadArchiveBundleToStoracha, type StorachaUploadResult } from 'storage-w3up';
import { fetchTargetTweet, type NormalizedTweet } from 'x-client';

type ArchiveSingleTweetInput = {
  mentionTweetId: string;
  targetTweetId: string;
};

type ArchiveSingleTweetDependencies = {
  fetchTargetTweetFn?: (targetTweetId: string) => Promise<NormalizedTweet>;
  buildSingleTweetBundleFn?: (
    input: BundleBuilderInput,
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
    mode: 'single';
    archiveMetadata: unknown;
  }) => Promise<void>;
  now?: () => string;
};

export type ArchiveSingleTweetResult = {
  cid: string;
  archivedAt: string;
  bundle: TweetBundle;
};

export async function archiveSingleTweet(
  input: ArchiveSingleTweetInput,
  dependencies: ArchiveSingleTweetDependencies = {}
): Promise<ArchiveSingleTweetResult> {
  const archivedAt = dependencies.now?.() ?? new Date().toISOString();
  const fetchTargetTweetFn = dependencies.fetchTargetTweetFn ?? fetchTargetTweet;
  const buildSingleTweetBundleFn = dependencies.buildSingleTweetBundleFn ?? buildSingleTweetBundle;
  const uploadArchiveBundleFn =
    dependencies.uploadArchiveBundleFn ?? uploadArchiveBundleToStoracha;
  const storeArchiveRecordFn = dependencies.storeArchiveRecordFn ?? storeArchiveRecord;

  const normalizedTweet = await fetchTargetTweetFn(input.targetTweetId);
  const bundle = buildSingleTweetBundleFn(normalizedTweet, {
    archivedAt,
    rawSnapshot: normalizedTweet
  });
  const uploadResult = await uploadArchiveBundleFn(bundle);

  await storeArchiveRecordFn({
    targetTweetId: input.targetTweetId,
    mentionTweetId: input.mentionTweetId,
    cid: uploadResult.cid,
    archivedAt,
    platform: 'x',
    command: 'archive',
    mode: 'single',
    archiveMetadata: bundle['bundle.json']
  });

  return {
    cid: uploadResult.cid,
    archivedAt,
    bundle
  };
}
