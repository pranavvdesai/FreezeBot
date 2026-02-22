import express, { NextFunction, Request, Response } from 'express';
import { verifyRequestSignature } from './signature';
import { parseCommand } from './command-parser';

type RawBodyRequest = Request & { rawBody?: Buffer };

export function createApp() {
  const app = express();

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

  app.post('/webhook', (req: RawBodyRequest, res) => {
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

    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const command = parseCommand(text);

    res.json({ ok: true, command });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error', err);
    res.status(500).json({ error: 'unexpected error' });
  });

  return app;
}
