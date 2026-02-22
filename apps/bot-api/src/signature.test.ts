import { describe, expect, it } from 'vitest';
import { computeSignature, verifyRequestSignature } from './signature';

describe('verifyRequestSignature', () => {
  const secret = 'test-secret';
  const payload = Buffer.from(JSON.stringify({ hello: 'world' }));

  it('accepts a valid signature', () => {
    const signature = computeSignature(payload, secret);
    const header = `sha256=${signature}`;

    expect(
      verifyRequestSignature({
        rawBody: payload,
        secret,
        signatureHeader: header
      })
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyRequestSignature({
        rawBody: payload,
        secret,
        signatureHeader: 'sha256=not-valid'
      })
    ).toBe(false);
  });

  it('rejects missing signature header', () => {
    expect(
      verifyRequestSignature({
        rawBody: payload,
        secret,
        signatureHeader: undefined
      })
    ).toBe(false);
  });
});
