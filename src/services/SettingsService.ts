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

const SETTINGS_ID = 'global';

export async function loadSettings(): Promise<AppSettings> {
  const row = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    return {
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
  }

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

export async function saveSettings(s: AppSettings): Promise<void> {
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
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
    },
    update: {
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
    },
  });
}
