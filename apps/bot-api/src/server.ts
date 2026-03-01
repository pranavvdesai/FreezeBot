import express, { NextFunction, Request, Response } from 'express';
import { verifyRequestSignature } from './signature';
import { ParsedCommand, parseCommand } from './command-parser';
import { postReply } from './post-reply';

type RawBodyRequest = Request & { rawBody?: Buffer };
type Logger = Pick<Console, 'error'>;

type CreateAppOptions = {
  postReplyFn?: (tweetId: string, message: string) => Promise<void>;
  logger?: Logger;
};

function buildReplyMessage(command: ParsedCommand) {
  return `FreezeBot is working\nCommand received: ${command.command} (${command.mode})`;
}

function readMentionTweetId(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as { tweetId?: unknown; tweet_id?: unknown };
  if (typeof payload.tweetId === 'string' && payload.tweetId.trim()) {
    return payload.tweetId.trim();
  }

  if (typeof payload.tweet_id === 'string' && payload.tweet_id.trim()) {
    return payload.tweet_id.trim();
  }

  return null;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const postReplyFn = options.postReplyFn ?? postReply;
  const logger = options.logger ?? console;

  app.use(
    express.json({
      verify: (req: RawBodyRequest, _res, buf) => {
        const safeBuffer = Buffer.isBuffer(buf) ? buf : Buffer.alloc(0);
        req.rawBody = Buffer.from(safeBuffer);
      }
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/webhook', async (req: RawBodyRequest, res) => {
    const secret = process.env.X_WEBHOOK_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'X_WEBHOOK_SECRET is not set' });
      return;
    }

    const signatureHeader =
      req.header('x-twitter-webhooks-signature') ??
      req.header('x-webhook-signature') ??
      req.header('x-twitter-signature') ??
      '';

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const isValidSignature = verifyRequestSignature({
      rawBody,
      secret,
      signatureHeader
    });

    if (!isValidSignature) {
      res.status(401).json({ error: 'invalid signature' });
      return;
    }

    const mentionTweetId = readMentionTweetId(req.body);
    if (!mentionTweetId) {
      res.status(400).json({ error: 'tweetId is required' });
      return;
    }

    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const command = parseCommand(text);
    if (!command) {
      res.status(400).json({ error: 'unsupported command' });
      return;
    }

    const message = buildReplyMessage(command);
    try {
      await postReplyFn(mentionTweetId, message);
    } catch (error) {
      logger.error('Failed to post reply', {
        error,
        tweetId: mentionTweetId,
        command
      });
      res.status(500).json({ error: 'failed to post reply' });
      return;
    }

    res.json({ ok: true, command, repliedTo: mentionTweetId });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error', err);
    res.status(500).json({ error: 'unexpected error' });
  });

  return app;
}
