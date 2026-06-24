import { PushHistoryStore } from '../PushHistoryStore';

// Mock fs to keep tests hermetic (no real disk writes).
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => '{}'),
  writeFileSync: jest.fn(),
}));

describe('PushHistoryStore', () => {
  it('stores and retrieves records by fingerprint', () => {
    const store = new PushHistoryStore();

    store.put('fp-1', {
      fingerprint: 'fp-1',
      key: 'XRAY-1',
      url: 'https://example/browse/XRAY-1',
      pushedAt: '2026-01-01T00:00:00.000Z'
    });

    const item = store.get('fp-1');
    expect(item?.key).toBe('XRAY-1');
  });

  it('stores records in batch and reports stats', () => {
    const store = new PushHistoryStore();

    store.putBatch([
      [
        'fp-1',
        {
          fingerprint: 'fp-1',
          key: 'XRAY-1',
          url: 'https://example/browse/XRAY-1',
          pushedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      [
        'fp-2',
        {
          fingerprint: 'fp-2',
          key: 'XRAY-2',
          url: 'https://example/browse/XRAY-2',
          pushedAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    ]);

    const stats = store.getStats();
    expect(stats.totalRecords).toBe(2);
    expect(stats.oldestPush).toBe('2026-01-01T00:00:00.000Z');
    expect(stats.newestPush).toBe('2026-01-02T00:00:00.000Z');
  });

  it('clears push history', () => {
    const store = new PushHistoryStore();

    store.put('fp-1', {
      fingerprint: 'fp-1',
      key: 'XRAY-1',
      url: 'https://example/browse/XRAY-1',
      pushedAt: '2026-01-01T00:00:00.000Z'
    });

    store.clear();

    expect(store.getAll()).toEqual({});
  });
});
