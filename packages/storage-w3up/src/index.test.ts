import { describe, expect, it } from 'vitest';
import { uploadArchiveBundleToStoracha } from './index';

describe('uploadArchiveBundleToStoracha', () => {
  it('returns a deterministic CID for the same bundle', async () => {
    const bundle = {
      'bundle.json': {
        schema: 'freeze/v1',
        source: { platform: 'x', tweetId: '1', archivedAt: '2026-03-17T00:00:00.000Z', mode: 'single' }
      }
    };

    const first = await uploadArchiveBundleToStoracha(bundle, {
      uploadedAt: '2026-03-17T00:00:00.000Z'
    });
    const second = await uploadArchiveBundleToStoracha(bundle, {
      uploadedAt: '2026-03-17T00:00:00.000Z'
    });

    expect(first.cid).toBe(second.cid);
    expect(first.cid.startsWith('bafy')).toBe(true);
  });
});
