import crypto from 'node:crypto';

export type ArchiveBundleInput = Record<string, unknown>;

export type StorachaUploadResult = {
  cid: string;
  uploadedAt: string;
  byteLength: number;
};

type UploadArchiveBundleOptions = {
  uploader?: (bundle: ArchiveBundleInput) => Promise<StorachaUploadResult>;
  uploadedAt?: string;
};

export async function uploadArchiveBundleToStoracha(
  bundle: ArchiveBundleInput,
  options: UploadArchiveBundleOptions = {}
): Promise<StorachaUploadResult> {
  if (options.uploader) {
    return options.uploader(bundle);
  }

  const serializedBundle = Buffer.from(JSON.stringify(bundle));
  const digest = crypto.createHash('sha256').update(serializedBundle).digest();
  const cid = createDevelopmentCid(digest);

  return {
    cid,
    uploadedAt: options.uploadedAt ?? new Date().toISOString(),
    byteLength: serializedBundle.byteLength
  };
}

function createDevelopmentCid(bytes: Buffer) {
  const encoded = toBase32(bytes).slice(0, 55);
  return `bafy${encoded}`;
}

function toBase32(input: Uint8Array) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}
