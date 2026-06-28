import { PushHistoryStore } from '../PushHistoryStore';

// Mock the Prisma singleton so tests never touch the real database.
jest.mock('../../../db/prisma', () => ({
  __esModule: true,
  default: {
    pushRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import prismaMock from '../../../db/prisma';

const pr = prismaMock.pushRecord as jest.Mocked<typeof prismaMock.pushRecord>;

const makeDbRecord = (fingerprint: string, key: string, url: string, pushedAt: string) => ({
  id: `id-${fingerprint}`,
  fingerprint,
  xrayKey: key,
  xrayUrl: url,
  pushedAt: new Date(pushedAt),
  generationId: null,
});

beforeEach(() => jest.clearAllMocks());

describe('PushHistoryStore', () => {
  it('stores and retrieves a record by fingerprint', async () => {
    const store = new PushHistoryStore();

    pr.upsert.mockResolvedValue(makeDbRecord('fp-1', 'XRAY-1', 'https://example/browse/XRAY-1', '2026-01-01T00:00:00.000Z'));
    pr.findUnique.mockResolvedValue(makeDbRecord('fp-1', 'XRAY-1', 'https://example/browse/XRAY-1', '2026-01-01T00:00:00.000Z'));

    await store.put('fp-1', {
      fingerprint: 'fp-1',
      key: 'XRAY-1',
      url: 'https://example/browse/XRAY-1',
      pushedAt: '2026-01-01T00:00:00.000Z',
    });

    const item = await store.get('fp-1');
    expect(item?.key).toBe('XRAY-1');
    expect(pr.findUnique).toHaveBeenCalledWith({ where: { fingerprint: 'fp-1' } });
  });

  it('returns undefined for an unknown fingerprint', async () => {
    const store = new PushHistoryStore();
    pr.findUnique.mockResolvedValue(null);
    const item = await store.get('fp-unknown');
    expect(item).toBeUndefined();
  });

  it('stores records in batch and reports stats', async () => {
    const store = new PushHistoryStore();

    pr.upsert.mockResolvedValue(makeDbRecord('fp-1', 'XRAY-1', 'https://example/browse/XRAY-1', '2026-01-01T00:00:00.000Z'));
    await store.putBatch([
      ['fp-1', { fingerprint: 'fp-1', key: 'XRAY-1', url: 'https://example/browse/XRAY-1', pushedAt: '2026-01-01T00:00:00.000Z' }],
      ['fp-2', { fingerprint: 'fp-2', key: 'XRAY-2', url: 'https://example/browse/XRAY-2', pushedAt: '2026-01-02T00:00:00.000Z' }],
    ]);
    expect(pr.upsert).toHaveBeenCalledTimes(2);

    pr.count.mockResolvedValue(2);
    pr.findFirst
      .mockResolvedValueOnce(makeDbRecord('fp-1', 'XRAY-1', 'https://example/browse/XRAY-1', '2026-01-01T00:00:00.000Z'))
      .mockResolvedValueOnce(makeDbRecord('fp-2', 'XRAY-2', 'https://example/browse/XRAY-2', '2026-01-02T00:00:00.000Z'));

    const stats = await store.getStats();
    expect(stats.totalRecords).toBe(2);
    expect(stats.oldestPush).toBe('2026-01-01T00:00:00.000Z');
    expect(stats.newestPush).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns all records keyed by fingerprint', async () => {
    const store = new PushHistoryStore();
    pr.findMany.mockResolvedValue([
      makeDbRecord('fp-1', 'XRAY-1', 'https://example/browse/XRAY-1', '2026-01-01T00:00:00.000Z'),
      makeDbRecord('fp-2', 'XRAY-2', 'https://example/browse/XRAY-2', '2026-01-02T00:00:00.000Z'),
    ]);

    const all = await store.getAll();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['fp-1'].key).toBe('XRAY-1');
    expect(all['fp-2'].key).toBe('XRAY-2');
  });

  it('clears push history', async () => {
    const store = new PushHistoryStore();
    pr.deleteMany.mockResolvedValue({ count: 1 });

    await store.clear();
    expect(pr.deleteMany).toHaveBeenCalledWith({});
  });
});
