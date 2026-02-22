import crypto from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

function normalizeSignatureHeader(signatureHeader: string) {
  const trimmed = signatureHeader.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith(SIGNATURE_PREFIX)
    ? trimmed.slice(SIGNATURE_PREFIX.length)
    : trimmed;
}

export function computeSignature(rawBody: Buffer, secret: string) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

export function verifyRequestSignature({
  rawBody,
  secret,
  signatureHeader
}: {
  rawBody: Buffer;
  secret: string;
  signatureHeader?: string | null;
}) {
  if (!signatureHeader) {
    return false;
  }

  const provided = normalizeSignatureHeader(signatureHeader);
  if (!provided) {
    return false;
  }

  const expected = computeSignature(rawBody, secret);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
