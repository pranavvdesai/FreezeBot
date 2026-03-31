import express, { NextFunction, Request, Response } from 'express';
import { findArchiveForRecover, getArchiveStatus } from 'indexer';
import { verifyRequestSignature } from './signature';
import { ParsedCommand, parseCommand } from './command-parser';
import { postReply } from './post-reply';
import { archiveSingleTweet } from './archive-single-tweet';
import { archiveThread } from './archive-thread';
import {
  ArchiveFlowError,
  invalidArchiveTargetError,
  toArchiveUnknownError
} from './archive-errors';

type RawBodyRequest = Request & { rawBody?: Buffer };
type Logger = Pick<Console, 'error'>;

type CreateAppOptions = {
  postReplyFn?: (tweetId: string, message: string) => Promise<void>;
  archiveSingleTweetFn?: (input: {
    mentionTweetId: string;
    targetTweetId: string;
  }) => Promise<{ cid: string }>;
  archiveThreadFn?: (input: {
    mentionTweetId: string;
    targetTweetId: string;
  }) => Promise<{ cid: string }>;
  getArchiveStatusFn?: (tweetId: string) => Promise<{
    cid: string;
    status: string;
  } | null>;
  findArchiveForRecoverFn?: (params: {
    tweetId?: string;
    conversationId?: string;
  }) => Promise<{
    cid: string;
  } | null>;
  logger?: Logger;
};

function buildReplyMessage(command: ParsedCommand) {
  return `FreezeBot is working\nCommand received: ${command.command} (${command.mode})`;
}

function buildArchiveSuccessMessage(cid: string) {
  return `Archived successfully ✅\nCID: ${cid}`;
}

function buildStatusMessage(result: { cid: string; status: string } | null) {
  if (!result) {
    return 'No archive found for this tweet yet.';
  }

  return `Archive status: ${result.status}\nCID: ${result.cid}`;
}

function buildRecoverMessage(result: { cid: string } | null) {
  if (!result) {
    return 'No archived copy was found for this tweet.';
  }

  return `Recovered archive\nCID: ${result.cid}`;
}

const HELP_REPLY_MESSAGE = `FreezeBot archives posts to decentralized storage with a content ID (CID).

Commands (reply or mention the bot):
• @Freeze this — archive this post (thread context when available)
• @Freeze this thread — capture the full thread
• @Freeze status — see if it is archived and get the CID
• @Freeze recover — get the archive when the original is gone
• @Freeze help — show this message`;

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

function readTargetTweetId(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null;
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

  return null;
}

function readConversationId(body: unknown, fallbackConversationId: string | null) {
  if (!body || typeof body !== 'object') {
    return fallbackConversationId;
  }

  const payload = body as {
    conversationId?: unknown;
    conversation_id?: unknown;
  };

  if (typeof payload.conversationId === 'string' && payload.conversationId.trim()) {
    return payload.conversationId.trim();
  }

  if (typeof payload.conversation_id === 'string' && payload.conversation_id.trim()) {
    return payload.conversation_id.trim();
  }

  return fallbackConversationId;
}

function getUserFacingArchiveErrorMessage(error: unknown) {
  if (error instanceof ArchiveFlowError) {
    return error.userMessage;
  }

  return toArchiveUnknownError(error).userMessage;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const postReplyFn = options.postReplyFn ?? postReply;
  const archiveSingleTweetFn = options.archiveSingleTweetFn ?? archiveSingleTweet;
  const archiveThreadFn = options.archiveThreadFn ?? archiveThread;
  const getArchiveStatusFn = options.getArchiveStatusFn ?? getArchiveStatus;
  const findArchiveForRecoverFn = options.findArchiveForRecoverFn ?? findArchiveForRecover;
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
    const targetTweetId = readTargetTweetId(req.body);
    const conversationId = readConversationId(req.body, targetTweetId);

    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const command = parseCommand(text);
    if (!command) {
      res.status(400).json({ error: 'unsupported command' });
      return;
    }

    if (command.command === 'archive' && command.mode === 'single') {
      try {
        if (!targetTweetId) {
          throw invalidArchiveTargetError();
        }

        const archiveResult = await archiveSingleTweetFn({
          mentionTweetId,
          targetTweetId
        });
        await postReplyFn(mentionTweetId, buildArchiveSuccessMessage(archiveResult.cid));
        res.json({ ok: true, command, cid: archiveResult.cid, repliedTo: mentionTweetId });
        return;
      } catch (error) {
        const archiveError = toArchiveUnknownError(error, {
          mentionTweetId,
          targetTweetId,
          mode: 'single'
        });
        logger.error('Failed to archive tweet', {
          code: archiveError.code,
          stage: archiveError.stage,
          message: archiveError.message,
          details: archiveError.details,
          cause: archiveError.cause,
          mentionTweetId,
          targetTweetId
        });

        try {
          await postReplyFn(mentionTweetId, getUserFacingArchiveErrorMessage(archiveError));
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

    if (command.command === 'archive' && command.mode === 'thread') {
      try {
        if (!targetTweetId) {
          throw invalidArchiveTargetError();
        }

        const archiveResult = await archiveThreadFn({
          mentionTweetId,
          targetTweetId
        });
        await postReplyFn(mentionTweetId, buildArchiveSuccessMessage(archiveResult.cid));
        res.json({ ok: true, command, cid: archiveResult.cid, repliedTo: mentionTweetId });
        return;
      } catch (error) {
        const archiveError = toArchiveUnknownError(error, {
          mentionTweetId,
          targetTweetId,
          mode: 'thread'
        });
        logger.error('Failed to archive thread', {
          code: archiveError.code,
          stage: archiveError.stage,
          message: archiveError.message,
          details: archiveError.details,
          cause: archiveError.cause,
          mentionTweetId,
          targetTweetId
        });

        try {
          await postReplyFn(mentionTweetId, getUserFacingArchiveErrorMessage(archiveError));
        } catch (replyError) {
          logger.error('Failed to post thread archive failure reply', {
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

    if (command.command === 'status') {
      try {
        const statusResult = await getArchiveStatusFn(targetTweetId ?? mentionTweetId);
        await postReplyFn(mentionTweetId, buildStatusMessage(statusResult));
        res.json({ ok: true, command, repliedTo: mentionTweetId, status: statusResult });
        return;
      } catch (error) {
        logger.error('Failed to lookup archive status', {
          error,
          mentionTweetId,
          targetTweetId
        });
        res.status(500).json({ error: 'failed to lookup archive status' });
        return;
      }
    }

    if (command.command === 'recover') {
      try {
        const recoverResult = await findArchiveForRecoverFn({
          tweetId: targetTweetId ?? mentionTweetId,
          conversationId: conversationId ?? undefined
        });
        await postReplyFn(mentionTweetId, buildRecoverMessage(recoverResult));
        res.json({ ok: true, command, repliedTo: mentionTweetId, archive: recoverResult });
        return;
      } catch (error) {
        logger.error('Failed to lookup recover archive', {
          error,
          mentionTweetId,
          targetTweetId,
          conversationId
        });
        res.status(500).json({ error: 'failed to lookup archive for recovery' });
        return;
      }
    }

    if (command.command === 'help') {
      try {
        await postReplyFn(mentionTweetId, HELP_REPLY_MESSAGE);
        res.json({ ok: true, command, repliedTo: mentionTweetId });
        return;
      } catch (error) {
        logger.error('Failed to post help reply', {
          error,
          mentionTweetId
        });
        res.status(500).json({ error: 'failed to post reply' });
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
