import { buildThreadBundle, type BundleBuilderInput, type TweetBundle } from 'archiver';
import { storeArchiveRecord } from 'indexer';
import { uploadArchiveBundleToStoracha, type StorachaUploadResult } from 'storage-w3up';
import { fetchThreadForTweet, type NormalizedThread } from 'x-client';
import { toArchiveFetchError, toArchiveStoreError, toArchiveUploadError } from './archive-errors';

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
    tweetId: string;
    conversationId: string;
    mentionTweetId: string;
    cid: string;
    status: 'archived';
    createdAt: string;
    updatedAt: string;
    mode: 'thread';
    archiveMetadata: unknown;
  }) => Promise<unknown>;
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

  let thread: NormalizedThread;
  try {
    thread = await fetchThreadForTweetFn(input.targetTweetId);
  } catch (error) {
    throw toArchiveFetchError(error, { targetTweetId: input.targetTweetId, mode: 'thread' });
  }

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
  let uploadResult: StorachaUploadResult;
  try {
    uploadResult = await uploadArchiveBundleFn(bundle);
  } catch (error) {
    throw toArchiveUploadError(error, { targetTweetId: input.targetTweetId, mode: 'thread' });
  }

  try {
    await storeArchiveRecordFn({
      tweetId: input.targetTweetId,
      conversationId: thread.conversationId,
      mentionTweetId: input.mentionTweetId,
      cid: uploadResult.cid,
      status: 'archived',
      createdAt: archivedAt,
      updatedAt: archivedAt,
      mode: 'thread',
      archiveMetadata: bundle['bundle.json']
    });
  } catch (error) {
    throw toArchiveStoreError(error, { targetTweetId: input.targetTweetId, mode: 'thread' });
  }

  return {
    cid: uploadResult.cid,
    archivedAt,
    bundle
  };
}
