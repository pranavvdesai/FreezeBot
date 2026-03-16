import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './server';
import { computeSignature } from './signature';

const secret = 'test-secret';

function signedHeader(body: unknown) {
  const rawBody = Buffer.from(JSON.stringify(body));
  return `sha256=${computeSignature(rawBody, secret)}`;
}

describe('webhook archive flow', () => {
  it('archives a single tweet and replies with the CID', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });
    const app = createApp({ postReplyFn, archiveSingleTweetFn });

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

  it('returns 401 for invalid signature', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockResolvedValue({ cid: 'bafyarchivecid' });
    const app = createApp({ postReplyFn, archiveSingleTweetFn });

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

  it('posts a friendly error reply when archive flow fails', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const logger = { error: vi.fn() };
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const archiveSingleTweetFn = vi.fn().mockRejectedValue(new Error('upload failed'));
    const app = createApp({ postReplyFn, archiveSingleTweetFn, logger });

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
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-555',
      "Sorry, I couldn't archive that tweet right now. Please try again."
    );
    expect(response.body.ok).toBe(false);
  });

  it('keeps placeholder replies for non-archive commands', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ postReplyFn });

    const payload = {
      mentionTweetId: 'mention-123',
      text: '@Freeze status'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(postReplyFn).toHaveBeenCalledWith(
      'mention-123',
      'FreezeBot is working\nCommand received: status (single)'
    );
  });
});
