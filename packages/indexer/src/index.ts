export type ArchiveRecord = {
  targetTweetId: string;
  mentionTweetId: string;
  cid: string;
  archivedAt: string;
  platform: 'x';
  command: 'archive';
  mode: 'single' | 'thread';
  archiveMetadata: unknown;
};

const archiveRecords = new Map<string, ArchiveRecord>();

export async function storeArchiveRecord(record: ArchiveRecord): Promise<void> {
  archiveRecords.set(record.targetTweetId, record);
}

export async function getArchiveRecord(targetTweetId: string): Promise<ArchiveRecord | null> {
  return archiveRecords.get(targetTweetId) ?? null;
}

export function clearArchiveRecords() {
  archiveRecords.clear();
}
