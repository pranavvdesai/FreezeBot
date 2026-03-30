import { buildSingleTweetBundle, type BundleBuilderInput, type TweetBundle } from 'archiver';
import { storeArchiveRecord } from 'indexer';
import { uploadArchiveBundleToStoracha, type StorachaUploadResult } from 'storage-w3up';
import { fetchTargetTweet, type NormalizedTweet } from 'x-client';
import { toArchiveFetchError, toArchiveStoreError, toArchiveUploadError } from './archive-errors';

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
    tweetId: string;
    conversationId: string;
    mentionTweetId: string;
    cid: string;
    status: 'archived';
    createdAt: string;
    updatedAt: string;
    mode: 'single';
    archiveMetadata: unknown;
  }) => Promise<unknown>;
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

  let normalizedTweet: NormalizedTweet;
  try {
    normalizedTweet = await fetchTargetTweetFn(input.targetTweetId);
  } catch (error) {
    throw toArchiveFetchError(error, { targetTweetId: input.targetTweetId, mode: 'single' });
  }

  const bundle = buildSingleTweetBundleFn(normalizedTweet, {
    archivedAt,
    rawSnapshot: normalizedTweet
  });
  let uploadResult: StorachaUploadResult;
  try {
    uploadResult = await uploadArchiveBundleFn(bundle);
  } catch (error) {
    throw toArchiveUploadError(error, { targetTweetId: input.targetTweetId, mode: 'single' });
  }

  try {
    await storeArchiveRecordFn({
      tweetId: input.targetTweetId,
      conversationId: normalizedTweet.conversationId,
      mentionTweetId: input.mentionTweetId,
      cid: uploadResult.cid,
      status: 'archived',
      createdAt: archivedAt,
      updatedAt: archivedAt,
      mode: 'single',
      archiveMetadata: bundle['bundle.json']
    });
  } catch (error) {
    throw toArchiveStoreError(error, { targetTweetId: input.targetTweetId, mode: 'single' });
  }

  return {
    cid: uploadResult.cid,
    archivedAt,
    bundle
  };
}
