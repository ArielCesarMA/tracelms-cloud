import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BUILT_IN_PROVIDERS = [
  {
    name: 'Gemini',
    displayLabel: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: 'key',
    compatibility: 'gemini',
    models: [
      { modelId: 'gemini-2.5-flash', displayLabel: 'Gemini 2.5 Flash', isDefault: false },
      { modelId: 'gemini-2.5-pro', displayLabel: 'Gemini 2.5 Pro', isDefault: false },
      { modelId: 'gemini-2.0-flash', displayLabel: 'Gemini 2.0 Flash', isDefault: true },
      { modelId: 'gemini-2.0-flash-lite', displayLabel: 'Gemini 2.0 Flash Lite', isDefault: false },
    ],
  },
  {
    name: 'OpenAI',
    displayLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authHeader: 'Bearer',
    compatibility: 'openai',
    models: [
      { modelId: 'gpt-4o', displayLabel: 'GPT-4o', isDefault: true },
      { modelId: 'gpt-4.1', displayLabel: 'GPT-4.1', isDefault: false },
      { modelId: 'gpt-4.1-mini', displayLabel: 'GPT-4.1 Mini', isDefault: false },
      { modelId: 'gpt-4o-mini', displayLabel: 'GPT-4o Mini', isDefault: false },
    ],
  },
  {
    name: 'Anthropic',
    displayLabel: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
    compatibility: 'anthropic',
    models: [
      { modelId: 'claude-3-5-sonnet-latest', displayLabel: 'Claude 3.5 Sonnet', isDefault: true },
      { modelId: 'claude-3-5-haiku-latest', displayLabel: 'Claude 3.5 Haiku', isDefault: false },
      { modelId: 'claude-3-opus-latest', displayLabel: 'Claude 3 Opus', isDefault: false },
    ],
  },
  {
    name: 'Groq',
    displayLabel: 'Groq (Free)',
    baseUrl: 'https://api.groq.com/openai/v1',
    authHeader: 'Bearer',
    compatibility: 'openai',
    models: [
      { modelId: 'llama-3.3-70b-versatile', displayLabel: 'Llama 3.3 70B Versatile', isDefault: true },
      { modelId: 'llama-3.1-8b-instant', displayLabel: 'Llama 3.1 8B Instant', isDefault: false },
      { modelId: 'llama3-70b-8192', displayLabel: 'Llama 3 70B', isDefault: false },
      { modelId: 'mixtral-8x7b-32768', displayLabel: 'Mixtral 8x7B', isDefault: false },
      { modelId: 'gemma2-9b-it', displayLabel: 'Gemma 2 9B', isDefault: false },
    ],
  },
];

async function main(): Promise<void> {
  console.log('Seeding built-in LLM providers...');

  for (const provider of BUILT_IN_PROVIDERS) {
    const { models, ...providerData } = provider;

    const upserted = await prisma.lLMProvider.upsert({
      where: { name: providerData.name },
      create: { ...providerData, isBuiltIn: true, isActive: true },
      update: { ...providerData, isBuiltIn: true },
    });

    for (const model of models) {
      await prisma.lLMModel.upsert({
        where: { providerId_modelId: { providerId: upserted.id, modelId: model.modelId } },
        create: { ...model, providerId: upserted.id },
        update: { displayLabel: model.displayLabel },
      });
    }

    console.log(`  ✓ ${providerData.name} (${models.length} models)`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
