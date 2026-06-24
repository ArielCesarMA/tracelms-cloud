export type XrayPushRecord = {
  fingerprint: string;
  key: string;
  url: string;
  pushedAt: string;
};

// In-memory store for the web version.
// Replace with a database (PostgreSQL/SQLite) when adding multi-user auth.
export class PushHistoryStore {
  private static readonly MAX_RECORDS = 5000;
  private store: Record<string, XrayPushRecord> = {};

  getAll(): Record<string, XrayPushRecord> {
    return { ...this.store };
  }

  get(fingerprint: string): XrayPushRecord | undefined {
    return this.store[fingerprint];
  }

  put(fingerprint: string, record: XrayPushRecord): void {
    this.store[fingerprint] = { ...record, pushedAt: record.pushedAt || new Date().toISOString() };
    this.trim();
  }

  putBatch(records: Array<[string, XrayPushRecord]>): void {
    for (const [fp, record] of records) {
      this.store[fp] = { ...record, pushedAt: record.pushedAt || new Date().toISOString() };
    }
    this.trim();
  }

  clear(): void {
    this.store = {};
  }

  getStats(): { totalRecords: number; oldestPush?: string; newestPush?: string } {
    const records = Object.values(this.store);
    if (records.length === 0) return { totalRecords: 0 };
    const sorted = [...records].sort((a, b) => new Date(a.pushedAt).getTime() - new Date(b.pushedAt).getTime());
    return { totalRecords: records.length, oldestPush: sorted[0].pushedAt, newestPush: sorted[sorted.length - 1].pushedAt };
  }

  private trim(): void {
    if (Object.keys(this.store).length <= PushHistoryStore.MAX_RECORDS) return;
    const sorted = Object.entries(this.store).sort(([, a], [, b]) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime());
    this.store = Object.fromEntries(sorted.slice(0, PushHistoryStore.MAX_RECORDS));
  }
}
