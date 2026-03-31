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

describe('webhook archive flow', () => {
  it('archives a single tweet and replies with the CID', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });
    const app = createApp({ postReplyFn, archiveSingleTweetFn, getArchiveStatusFn });

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
    expect(getArchiveStatusFn).toHaveBeenCalledWith('target-456');
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
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);
    const archiveThreadFn = vi.fn().mockResolvedValue({ cid: 'bafythreadcid' });
    const app = createApp({ postReplyFn, archiveThreadFn, getArchiveStatusFn });

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
    expect(getArchiveStatusFn).toHaveBeenCalledWith('target-888');
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
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });
    const app = createApp({ postReplyFn, archiveSingleTweetFn, getArchiveStatusFn });

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
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);
    const archiveSingleTweetFn = vi.fn().mockRejectedValue(
      new ArchiveFlowError({
        code: 'tweet_not_found',
        stage: 'fetch',
        message: 'Target tweet missing'
      })
    );
    const app = createApp({ postReplyFn, archiveSingleTweetFn, getArchiveStatusFn, logger });

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
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);
    const archiveSingleTweetFn = vi.fn().mockRejectedValue(
      new ArchiveFlowError({
        code: 'upload_failed',
        stage: 'upload',
        message: 'Upload failed'
      })
    );
    const app = createApp({ postReplyFn, archiveSingleTweetFn, getArchiveStatusFn, logger });

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
    const getArchiveStatusFn = vi.fn().mockResolvedValue(null);
    const archiveThreadFn = vi.fn().mockRejectedValue(
      new ArchiveFlowError({
        code: 'db_write_failed',
        stage: 'store',
        message: 'DB write failed'
      })
    );
    const app = createApp({ postReplyFn, archiveThreadFn, getArchiveStatusFn, logger });

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
    const app = createApp({ postReplyFn, logger });

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
    const app = createApp({ postReplyFn, getArchiveStatusFn });

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
    const app = createApp({ postReplyFn, findArchiveForRecoverFn });

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

  it('short-circuits single-tweet archive when the target is already archived (same mode)', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue({
      cid: 'bafyexisting',
      status: 'archived',
      createdAt: '2026-03-30T12:00:00.000Z',
      mode: 'single' as const
    });
    const archiveSingleTweetFn = vi.fn();
    const app = createApp({ postReplyFn, archiveSingleTweetFn, getArchiveStatusFn });

    const payload = {
      mentionTweetId: 'mention-dup',
      targetTweetId: 'target-dup',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(archiveSingleTweetFn).not.toHaveBeenCalled();
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-dup',
      'Already archived ✅\nFirst captured: 2026-03-30T12:00:00.000Z\nCID: bafyexisting'
    );
    expect(response.body).toMatchObject({
      ok: true,
      cid: 'bafyexisting',
      duplicate: true,
      repliedTo: 'mention-dup'
    });
  });

  it('short-circuits single-tweet archive when a thread archive already exists', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue({
      cid: 'bafythread',
      status: 'archived',
      createdAt: '2026-03-30T11:00:00.000Z',
      mode: 'thread' as const
    });
    const archiveSingleTweetFn = vi.fn();
    const app = createApp({ postReplyFn, archiveSingleTweetFn, getArchiveStatusFn });

    const payload = {
      mentionTweetId: 'mention-dup2',
      targetTweetId: 'target-dup2',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(archiveSingleTweetFn).not.toHaveBeenCalled();
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-dup2',
      'Already archived ✅\nFirst captured: 2026-03-30T11:00:00.000Z\nCID: bafythread'
    );
  });

  it('short-circuits thread archive when a thread archive already exists', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue({
      cid: 'bafythread2',
      status: 'archived',
      createdAt: '2026-03-29T10:00:00.000Z',
      mode: 'thread' as const
    });
    const archiveThreadFn = vi.fn();
    const app = createApp({ postReplyFn, archiveThreadFn, getArchiveStatusFn });

    const payload = {
      mentionTweetId: 'mention-dup3',
      targetTweetId: 'target-dup3',
      text: '@Freeze this thread'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(archiveThreadFn).not.toHaveBeenCalled();
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-dup3',
      'Already archived ✅\nFirst captured: 2026-03-29T10:00:00.000Z\nCID: bafythread2'
    );
    expect(response.body.duplicate).toBe(true);
  });

  it('runs thread archive when only a single-tweet archive exists', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const getArchiveStatusFn = vi.fn().mockResolvedValue({
      cid: 'bafysingleonly',
      status: 'archived',
      createdAt: '2026-03-28T09:00:00.000Z',
      mode: 'single' as const
    });
    const archiveThreadFn = vi.fn().mockResolvedValue({ cid: 'bafynewthread' });
    const app = createApp({ postReplyFn, archiveThreadFn, getArchiveStatusFn });

    const payload = {
      mentionTweetId: 'mention-upgrade',
      targetTweetId: 'target-upgrade',
      text: '@Freeze this thread'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(archiveThreadFn).toHaveBeenCalled();
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-upgrade',
      'Archived successfully ✅\nCID: bafynewthread'
    );
    expect(response.body.duplicate).toBeUndefined();
  });
});
