import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './server';
import { computeSignature } from './signature';
import { ArchiveFlowError } from './archive-errors';

const secret = 'test-secret';

function signedHeader(body: unknown) {
  const rawBody = Buffer.from(JSON.stringify(body));
  return `sha256=${computeSignature(rawBody, secret)}`;
}

function testApp(options: Parameters<typeof createApp>[0]) {
  return createApp({
    isWebhookMentionProcessedFn: async () => false,
    recordWebhookMentionProcessedFn: async () => {},
    ...options
  });
}

describe('webhook archive flow', () => {
  it('archives a single tweet and replies with the CID', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });
    const app = testApp({ postReplyFn, archiveSingleTweetFn });

    const payload = {
      mentionTweetId: 'mention-123',
      targetTweetId: 'target-456',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(archiveSingleTweetFn).toHaveBeenCalledWith({
      mentionTweetId: 'mention-123',
      targetTweetId: 'target-456'
    });
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-123',
      'Archived successfully ✅\nCID: bafyarchivecid'
    );
    expect(response.body.cid).toBe('bafyarchivecid');
  });

  it('archives a thread and replies with the CID', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveThreadFn = vi.fn().mockResolvedValue({ cid: 'bafythreadcid' });
    const app = testApp({ postReplyFn, archiveThreadFn });

    const payload = {
      mentionTweetId: 'mention-777',
      targetTweetId: 'target-888',
      text: '@Freeze this thread'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(archiveThreadFn).toHaveBeenCalledWith({
      mentionTweetId: 'mention-777',
      targetTweetId: 'target-888'
    });
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-777',
      'Archived successfully ✅\nCID: bafythreadcid'
    );
    expect(response.body.cid).toBe('bafythreadcid');
  });

  it('returns 401 for invalid signature', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });
    const app = testApp({ postReplyFn, archiveSingleTweetFn });

    const payload = {
      mentionTweetId: 'mention-123',
      targetTweetId: 'target-456',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', 'sha256=invalid')
      .send(payload);

    expect(response.status).toBe(401);
    expect(postReplyFn).not.toHaveBeenCalled();
    expect(archiveSingleTweetFn).not.toHaveBeenCalled();
  });

  it('replies with a simple message when the tweet cannot be fetched', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const logger = { error: vi.fn() };
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockRejectedValue(
      new ArchiveFlowError({
        code: 'tweet_not_found',
        stage: 'fetch',
        message: 'Target tweet missing'
      })
    );
    const app = testApp({ postReplyFn, archiveSingleTweetFn, logger });

    const payload = {
      mentionTweetId: 'mention-555',
      targetTweetId: 'target-999',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to archive tweet',
      expect.objectContaining({
        code: 'tweet_not_found',
        stage: 'fetch',
        mentionTweetId: 'mention-555',
        targetTweetId: 'target-999'
      })
    );
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-555',
      'Tweet not found'
    );
    expect(response.body.ok).toBe(false);
  });

  it('replies with a simple message when upload fails', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const logger = { error: vi.fn() };
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockRejectedValue(
      new ArchiveFlowError({
        code: 'upload_failed',
        stage: 'upload',
        message: 'Upload failed'
      })
    );
    const app = testApp({ postReplyFn, archiveSingleTweetFn, logger });

    const payload = {
      mentionTweetId: 'mention-901',
      targetTweetId: 'target-999',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to archive tweet',
      expect.objectContaining({
        code: 'upload_failed',
        stage: 'upload',
        mentionTweetId: 'mention-901',
        targetTweetId: 'target-999'
      })
    );
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-901',
      'Archive upload failed, please try again'
    );
    expect(response.body.ok).toBe(false);
  });

  it('replies with a simple message when the DB write fails', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const logger = { error: vi.fn() };
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveThreadFn = vi.fn().mockRejectedValue(
      new ArchiveFlowError({
        code: 'db_write_failed',
        stage: 'store',
        message: 'DB write failed'
      })
    );
    const app = testApp({ postReplyFn, archiveThreadFn, logger });

    const payload = {
      mentionTweetId: 'mention-902',
      targetTweetId: 'target-999',
      text: '@Freeze this thread'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to archive thread',
      expect.objectContaining({
        code: 'db_write_failed',
        stage: 'store',
        mentionTweetId: 'mention-902',
        targetTweetId: 'target-999'
      })
    );
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-902',
      'Archive save failed, please try again'
    );
    expect(response.body.ok).toBe(false);
  });

  it('replies with a simple message when the archive target is invalid', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const logger = { error: vi.fn() };
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const app = testApp({ postReplyFn, logger });

    const payload = {
      mentionTweetId: 'mention-404',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to archive tweet',
      expect.objectContaining({
        code: 'invalid_target',
        stage: 'validate',
        mentionTweetId: 'mention-404',
        targetTweetId: null
      })
    );
    expect(postReplyFn).toHaveBeenCalledWith('mention-404', 'Reply to a tweet to archive it');
    expect(response.body.ok).toBe(false);
  });

  it('looks up archive status and replies with the CID', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue({
      cid: 'bafystatuscid',
      status: 'archived'
    });
    const app = testApp({ postReplyFn, getArchiveStatusFn });

    const payload = {
      mentionTweetId: 'mention-123',
      targetTweetId: 'target-123',
      text: '@Freeze status'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(getArchiveStatusFn).toHaveBeenCalledWith('target-123');
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-123',
      'Archive status: archived\nCID: bafystatuscid'
    );
  });

  it('looks up recover archive by conversation and replies with the CID', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const findArchiveForRecoverFn = vi.fn().mockResolvedValue({
      cid: 'bafyrecovercid'
    });
    const app = testApp({ postReplyFn, findArchiveForRecoverFn });

    const payload = {
      mentionTweetId: 'mention-321',
      targetTweetId: 'target-321',
      conversationId: 'conversation-321',
      text: '@Freeze recover'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(findArchiveForRecoverFn).toHaveBeenCalledWith({
      tweetId: 'target-321',
      conversationId: 'conversation-321'
    });
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-321',
      'Recovered archive\nCID: bafyrecovercid'
    );
  });

  it('deduplicates webhook deliveries for the same mention tweet id', async () => {
    process.env.X_WEBHOOK_SECRET = secret;

    let recorded = false;
    const isWebhookMentionProcessedFn = vi.fn().mockImplementation(async () => recorded);
    const recordWebhookMentionProcessedFn = vi.fn().mockImplementation(async () => {
      recorded = true;
    });
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });

    const app = createApp({
      isWebhookMentionProcessedFn,
      recordWebhookMentionProcessedFn,
      postReplyFn,
      archiveSingleTweetFn
    });

    const payload = {
      mentionTweetId: 'mention-dedup',
      targetTweetId: 'target-dedup',
      text: '@Freeze this'
    };

    const first = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    const second = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.deduplicated).toBeUndefined();
    expect(second.body).toMatchObject({
      ok: true,
      deduplicated: true,
      repliedTo: 'mention-dedup'
    });
    expect(archiveSingleTweetFn).toHaveBeenCalledTimes(1);
    expect(postReplyFn).toHaveBeenCalledTimes(1);
    expect(recordWebhookMentionProcessedFn).toHaveBeenCalledTimes(1);
  });
});
