import prisma from '../db/prisma';
import { encrypt, decrypt } from '../utils/encryption';

export interface AppSettings {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  jiraUrl: string;
  jiraProjectKey: string;
  jiraEmail: string;
  jiraApiToken: string;
  xrayClientId: string;
  xrayClientSecret: string;
  xrayBatchSize: string;
  xrayBatchDelayMs: string;
  xrayMaxRetries: string;
}

const DEFAULTS: AppSettings = {
  llmProvider: 'Gemini',
  llmModel: '',
  llmApiKey: '',
  jiraUrl: '',
  jiraProjectKey: '',
  jiraEmail: '',
  jiraApiToken: '',
  xrayClientId: '',
  xrayClientSecret: '',
  xrayBatchSize: '10',
  xrayBatchDelayMs: '1000',
  xrayMaxRetries: '3',
};

function rowToSettings(row: {
  llmProvider: string; llmModel: string; llmApiKeyEnc: string;
  jiraUrl: string; jiraProjectKey: string; jiraEmail: string; jiraApiTokenEnc: string;
  xrayClientId: string; xrayClientSecEnc: string;
  xrayBatchSize: number; xrayBatchDelayMs: number; xrayMaxRetries: number;
}): AppSettings {
  return {
    llmProvider: row.llmProvider,
    llmModel: row.llmModel,
    llmApiKey: decrypt(row.llmApiKeyEnc),
    jiraUrl: row.jiraUrl,
    jiraProjectKey: row.jiraProjectKey,
    jiraEmail: row.jiraEmail,
    jiraApiToken: decrypt(row.jiraApiTokenEnc),
    xrayClientId: row.xrayClientId,
    xrayClientSecret: decrypt(row.xrayClientSecEnc),
    xrayBatchSize: String(row.xrayBatchSize),
    xrayBatchDelayMs: String(row.xrayBatchDelayMs),
    xrayMaxRetries: String(row.xrayMaxRetries),
  };
}

// Phase 3: settings are now scoped per user.
// On first load for a user, we attempt to claim the legacy global row (userId=null).
// This migrates existing settings data to the authenticated user without requiring a
// manual data migration step.
export async function loadSettings(userId: string): Promise<AppSettings> {
  // Try the user's own row first
  let row = await prisma.settings.findUnique({ where: { userId } });

  if (row) return rowToSettings(row);

  // Fall back to the unclaimed legacy row (id='global' or any row with userId=null)
  const legacyRow = await prisma.settings.findFirst({ where: { userId: null } });

  if (legacyRow) {
    // Claim it for this user
    await prisma.settings.update({ where: { id: legacyRow.id }, data: { userId } });
    return rowToSettings(legacyRow);
  }

  return DEFAULTS;
}

export async function saveSettings(userId: string, s: AppSettings): Promise<void> {
  const data = {
    userId,
    llmProvider: s.llmProvider,
    llmModel: s.llmModel,
    llmApiKeyEnc: encrypt(s.llmApiKey),
    jiraUrl: s.jiraUrl,
    jiraProjectKey: s.jiraProjectKey,
    jiraEmail: s.jiraEmail,
    jiraApiTokenEnc: encrypt(s.jiraApiToken),
    xrayClientId: s.xrayClientId,
    xrayClientSecEnc: encrypt(s.xrayClientSecret),
    xrayBatchSize: parseInt(s.xrayBatchSize, 10) || 10,
    xrayBatchDelayMs: parseInt(s.xrayBatchDelayMs, 10) || 1000,
    xrayMaxRetries: parseInt(s.xrayMaxRetries, 10) || 3,
  };

  await prisma.settings.upsert({
    where: { userId },
    create: data,
    update: data,
  });
}
