import express, { NextFunction, Request, Response } from 'express';
import { verifyRequestSignature } from './signature';
import { ParsedCommand, parseCommand } from './command-parser';
import { postReply } from './post-reply';
import { archiveSingleTweet } from './archive-single-tweet';

type RawBodyRequest = Request & { rawBody?: Buffer };
type Logger = Pick<Console, 'error'>;

type CreateAppOptions = {
  postReplyFn?: (tweetId: string, message: string) => Promise<void>;
  archiveSingleTweetFn?: (input: {
    mentionTweetId: string;
    targetTweetId: string;
  }) => Promise<{ cid: string }>;
  logger?: Logger;
};

function buildReplyMessage(command: ParsedCommand) {
  return `FreezeBot is working\nCommand received: ${command.command} (${command.mode})`;
}

function buildArchiveSuccessMessage(cid: string) {
  return `Archived successfully ✅\nCID: ${cid}`;
}

function buildArchiveFailureMessage() {
  return "Sorry, I couldn't archive that tweet right now. Please try again.";
}

function readMentionTweetId(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as {
    id?: unknown;
    tweetId?: unknown;
    tweet_id?: unknown;
    mentionTweetId?: unknown;
    mention_tweet_id?: unknown;
  };
  if (typeof payload.mentionTweetId === 'string' && payload.mentionTweetId.trim()) {
    return payload.mentionTweetId.trim();
  }

  if (typeof payload.mention_tweet_id === 'string' && payload.mention_tweet_id.trim()) {
    return payload.mention_tweet_id.trim();
  }

  if (typeof payload.id === 'string' && payload.id.trim()) {
    return payload.id.trim();
  }

  if (typeof payload.tweetId === 'string' && payload.tweetId.trim()) {
    return payload.tweetId.trim();
  }

  if (typeof payload.tweet_id === 'string' && payload.tweet_id.trim()) {
    return payload.tweet_id.trim();
  }

  return null;
}

function readTargetTweetId(body: unknown, fallbackTweetId: string | null) {
  if (!body || typeof body !== 'object') {
    return fallbackTweetId;
  }

  const payload = body as {
    targetTweetId?: unknown;
    target_tweet_id?: unknown;
    in_reply_to_tweet_id?: unknown;
    referenced_tweets?: Array<{ id?: unknown; type?: unknown }>;
  };

  if (typeof payload.targetTweetId === 'string' && payload.targetTweetId.trim()) {
    return payload.targetTweetId.trim();
  }

  if (typeof payload.target_tweet_id === 'string' && payload.target_tweet_id.trim()) {
    return payload.target_tweet_id.trim();
  }

  if (
    typeof payload.in_reply_to_tweet_id === 'string' &&
    payload.in_reply_to_tweet_id.trim()
  ) {
    return payload.in_reply_to_tweet_id.trim();
  }

  const repliedToTweet = payload.referenced_tweets?.find(
    (tweet) => tweet.type === 'replied_to' && typeof tweet.id === 'string' && tweet.id.trim()
  );
  if (typeof repliedToTweet?.id === 'string') {
    return repliedToTweet.id.trim();
  }

  return fallbackTweetId;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const postReplyFn = options.postReplyFn ?? postReply;
  const archiveSingleTweetFn = options.archiveSingleTweetFn ?? archiveSingleTweet;
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
    const targetTweetId = readTargetTweetId(req.body, mentionTweetId);

    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const command = parseCommand(text);
    if (!command) {
      res.status(400).json({ error: 'unsupported command' });
      return;
    }

    if (command.command === 'archive' && command.mode === 'single') {
      try {
        const archiveResult = await archiveSingleTweetFn({
          mentionTweetId,
          targetTweetId: targetTweetId ?? mentionTweetId
        });
        await postReplyFn(mentionTweetId, buildArchiveSuccessMessage(archiveResult.cid));
        res.json({ ok: true, command, cid: archiveResult.cid, repliedTo: mentionTweetId });
        return;
      } catch (error) {
        logger.error('Failed to archive tweet', {
          error,
          mentionTweetId,
          targetTweetId
        });

        try {
          await postReplyFn(mentionTweetId, buildArchiveFailureMessage());
        } catch (replyError) {
          logger.error('Failed to post archive failure reply', {
            error: replyError,
            mentionTweetId,
            targetTweetId
          });
          res.status(500).json({ error: 'failed to post reply' });
          return;
        }

        res.json({ ok: false, error: 'archive failed', repliedTo: mentionTweetId });
        return;
      }
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
