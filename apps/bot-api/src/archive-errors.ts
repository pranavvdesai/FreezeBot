import { XClientError } from 'x-client';

export type ArchiveErrorCode =
  | 'invalid_target'
  | 'tweet_not_found'
  | 'fetch_failed'
  | 'upload_failed'
  | 'db_write_failed'
  | 'unknown';

const userMessages: Record<ArchiveErrorCode, string> = {
  invalid_target: 'Reply to a tweet to archive it',
  tweet_not_found: 'Tweet not found',
  fetch_failed: 'Could not fetch this tweet',
  upload_failed: 'Archive upload failed, please try again',
  db_write_failed: 'Archive save failed, please try again',
  unknown: "Sorry, I couldn't archive that tweet right now. Please try again."
};

export class ArchiveFlowError extends Error {
  readonly code: ArchiveErrorCode;
  readonly stage: 'validate' | 'fetch' | 'upload' | 'store' | 'unknown';
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(options: {
    code: ArchiveErrorCode;
    stage: 'validate' | 'fetch' | 'upload' | 'store' | 'unknown';
    message: string;
    cause?: unknown;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'ArchiveFlowError';
    this.code = options.code;
    this.stage = options.stage;
    this.userMessage = userMessages[options.code];
    this.cause = options.cause;
    this.details = options.details;
  }
}

export function invalidArchiveTargetError() {
  return new ArchiveFlowError({
    code: 'invalid_target',
    stage: 'validate',
    message: 'Archive target tweet id is missing'
  });
}

export function toArchiveFetchError(error: unknown, details?: Record<string, unknown>) {
  if (error instanceof ArchiveFlowError) {
    return error;
  }

  if (error instanceof XClientError && error.status === 404) {
    return new ArchiveFlowError({
      code: 'tweet_not_found',
      stage: 'fetch',
      message: 'Target tweet was not found on X',
      cause: error,
      details
    });
  }

  return new ArchiveFlowError({
    code: 'fetch_failed',
    stage: 'fetch',
    message: 'Failed to fetch target tweet from X',
    cause: error,
    details
  });
}

export function toArchiveUploadError(error: unknown, details?: Record<string, unknown>) {
  if (error instanceof ArchiveFlowError) {
    return error;
  }

  return new ArchiveFlowError({
    code: 'upload_failed',
    stage: 'upload',
    message: 'Failed to upload archive bundle',
    cause: error,
    details
  });
}

export function toArchiveStoreError(error: unknown, details?: Record<string, unknown>) {
  if (error instanceof ArchiveFlowError) {
    return error;
  }

  return new ArchiveFlowError({
    code: 'db_write_failed',
    stage: 'store',
    message: 'Failed to store archive record',
    cause: error,
    details
  });
}

export function toArchiveUnknownError(error: unknown, details?: Record<string, unknown>) {
  if (error instanceof ArchiveFlowError) {
    return error;
  }

  return new ArchiveFlowError({
    code: 'unknown',
    stage: 'unknown',
    message: 'Unknown archive flow failure',
    cause: error,
    details
  });
}
