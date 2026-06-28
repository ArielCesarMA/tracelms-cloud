import prisma from '../../db/prisma';

export type XrayPushRecord = {
  fingerprint: string;
  key: string;
  url: string;
  pushedAt: string;
};

export class PushHistoryStore {
  async get(fingerprint: string): Promise<XrayPushRecord | undefined> {
    const record = await prisma.pushRecord.findUnique({ where: { fingerprint } });
    if (!record) return undefined;
    return {
      fingerprint: record.fingerprint,
      key: record.xrayKey,
      url: record.xrayUrl,
      pushedAt: record.pushedAt.toISOString(),
    };
  }

  async getAll(): Promise<Record<string, XrayPushRecord>> {
    const records = await prisma.pushRecord.findMany();
    return Object.fromEntries(
      records.map((r) => [
        r.fingerprint,
        { fingerprint: r.fingerprint, key: r.xrayKey, url: r.xrayUrl, pushedAt: r.pushedAt.toISOString() },
      ])
    );
  }

  async put(fingerprint: string, record: XrayPushRecord): Promise<void> {
    await prisma.pushRecord.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        xrayKey: record.key,
        xrayUrl: record.url,
        pushedAt: new Date(record.pushedAt || new Date()),
      },
      update: {
        xrayKey: record.key,
        xrayUrl: record.url,
        pushedAt: new Date(record.pushedAt || new Date()),
      },
    });
  }

  async putBatch(records: Array<[string, XrayPushRecord]>): Promise<void> {
    await prisma.$transaction(
      records.map(([fp, r]) =>
        prisma.pushRecord.upsert({
          where: { fingerprint: fp },
          create: {
            fingerprint: fp,
            xrayKey: r.key,
            xrayUrl: r.url,
            pushedAt: new Date(r.pushedAt || new Date()),
          },
          update: {
            xrayKey: r.key,
            xrayUrl: r.url,
            pushedAt: new Date(r.pushedAt || new Date()),
          },
        })
      )
    );
  }

  async clear(): Promise<void> {
    await prisma.pushRecord.deleteMany({});
  }

  async getStats(): Promise<{ totalRecords: number; oldestPush?: string; newestPush?: string }> {
    const [totalRecords, oldest, newest] = await Promise.all([
      prisma.pushRecord.count(),
      prisma.pushRecord.findFirst({ orderBy: { pushedAt: 'asc' } }),
      prisma.pushRecord.findFirst({ orderBy: { pushedAt: 'desc' } }),
    ]);
    return {
      totalRecords,
      oldestPush: oldest?.pushedAt.toISOString(),
      newestPush: newest?.pushedAt.toISOString(),
    };
  }
}
