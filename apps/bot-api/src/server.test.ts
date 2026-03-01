import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './server';
import { computeSignature } from './signature';

const secret = 'test-secret';

function signedHeader(body: unknown) {
  const rawBody = Buffer.from(JSON.stringify(body));
  return `sha256=${computeSignature(rawBody, secret)}`;
}

describe('webhook reply flow', () => {
  it('triggers postReply for valid mention command', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ postReplyFn });

    const payload = {
      tweetId: '12345',
      text: '@Freeze this'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(postReplyFn).toHaveBeenCalledWith(
      '12345',
      'FreezeBot is working\nCommand received: archive (single)'
    );
  });

  it('returns 401 for invalid signature', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const postReplyFn = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ postReplyFn });

    const payload = {
      tweetId: '12345',
      text: '@Freeze status'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', 'sha256=invalid')
      .send(payload);

    expect(response.status).toBe(401);
    expect(postReplyFn).not.toHaveBeenCalled();
  });

  it('logs and returns 500 when posting reply fails', async () => {
    process.env.X_WEBHOOK_SECRET = secret;
    const logger = { error: vi.fn() };
    const postReplyFn = vi.fn().mockRejectedValue(new Error('network failed'));
    const app = createApp({ postReplyFn, logger });

    const payload = {
      tweetId: '555',
      text: '@Freeze recover'
    };

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signedHeader(payload))
      .send(payload);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
