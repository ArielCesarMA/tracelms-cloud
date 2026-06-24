import fs from 'fs';
import path from 'path';

export type XrayPushRecord = {
  fingerprint: string;
  key: string;
  url: string;
  pushedAt: string;
};

// BUG-5 fix: persist push history to a JSON file so server restarts don't lose dedup records.
// The file is written synchronously on every put() to keep the logic simple and avoid
// partial-write races. For multi-user or high-volume use, replace with SQLite/PostgreSQL.
const HISTORY_FILE = path.join(process.cwd(), '.push-history.json');

function loadFromDisk(): Record<string, XrayPushRecord> {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(raw) as Record<string, XrayPushRecord>;
    }
  } catch {
    console.warn('[PushHistoryStore] Could not load history file — starting fresh.');
  }
  return {};
}

function saveToDisk(store: Record<string, XrayPushRecord>): void {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[PushHistoryStore] Failed to persist history:', err);
  }
}

export class PushHistoryStore {
  private static readonly MAX_RECORDS = 5000;
  private store: Record<string, XrayPushRecord> = loadFromDisk();

  getAll(): Record<string, XrayPushRecord> {
    return { ...this.store };
  }

  get(fingerprint: string): XrayPushRecord | undefined {
    return this.store[fingerprint];
  }

  put(fingerprint: string, record: XrayPushRecord): void {
    this.store[fingerprint] = { ...record, pushedAt: record.pushedAt || new Date().toISOString() };
    this.trim();
    saveToDisk(this.store);
  }

  putBatch(records: Array<[string, XrayPushRecord]>): void {
    for (const [fp, record] of records) {
      this.store[fp] = { ...record, pushedAt: record.pushedAt || new Date().toISOString() };
    }
    this.trim();
    saveToDisk(this.store);
  }

  clear(): void {
    this.store = {};
    saveToDisk(this.store);
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
