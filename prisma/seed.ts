import 'dotenv/config';
import fs from 'fs';
import path from 'path';
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
      { modelId: 'gemini-2.5-flash', displayLabel: 'Gemini 2.5 Flash', isDefault: true },
      { modelId: 'gemini-2.5-pro', displayLabel: 'Gemini 2.5 Pro', isDefault: false },
      { modelId: 'gemini-3.1-pro', displayLabel: 'Gemini 3.1 Pro', isDefault: false },
    ],
  },
  {
    name: 'OpenAI',
    displayLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authHeader: 'Bearer',
    compatibility: 'openai',
    models: [
      { modelId: 'gpt-4.1', displayLabel: 'GPT-4.1', isDefault: true },
      { modelId: 'gpt-4.1-mini', displayLabel: 'GPT-4.1 Mini', isDefault: false },
      { modelId: 'gpt-4o-mini', displayLabel: 'GPT-4o Mini', isDefault: false },
      { modelId: 'o4-mini', displayLabel: 'o4 Mini', isDefault: false },
    ],
  },
  {
    name: 'Anthropic',
    displayLabel: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
    compatibility: 'anthropic',
    models: [
      { modelId: 'claude-opus-4-8', displayLabel: 'Claude Opus 4.8', isDefault: true },
      { modelId: 'claude-sonnet-4-6', displayLabel: 'Claude Sonnet 4.6', isDefault: false },
      { modelId: 'claude-haiku-4-5', displayLabel: 'Claude Haiku 4.5', isDefault: false },
      { modelId: 'claude-fable-5', displayLabel: 'Claude Fable 5', isDefault: false },
    ],
  },
  {
    name: 'Groq',
    displayLabel: 'Groq (Free)',
    baseUrl: 'https://api.groq.com/openai/v1',
    authHeader: 'Bearer',
    compatibility: 'openai',
    models: [
      { modelId: 'llama-4-scout-17b-16e-instruct', displayLabel: 'Llama 4 Scout 17B', isDefault: true },
      { modelId: 'llama-3.3-70b-specdec', displayLabel: 'Llama 3.3 70B SpecDec', isDefault: false },
      { modelId: 'llama3-70b-8192', displayLabel: 'Llama 3 70B', isDefault: false },
      { modelId: 'mixtral-8x7b-32768', displayLabel: 'Mixtral 8x7B', isDefault: false },
      { modelId: 'gemma2-9b-it', displayLabel: 'Gemma 2 9B', isDefault: false },
    ],
  },
];

const PROMPT_STEPS = [
  { step: 'ENHANCEMENT' as const, name: 'Requirement Enhancement', file: 'requirement-enhancement.txt' },
  { step: 'SCENARIOS'   as const, name: 'Scenario Generation',      file: 'scenario-generation.txt' },
  { step: 'TEST_CASES'  as const, name: 'Test Case Generation',     file: 'test-case-generation.txt' },
  { step: 'AUTOMATION'  as const, name: 'Automation Analysis',       file: 'automation-analysis.txt' },
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

  console.log('Seeding built-in prompt templates...');
  const promptsDir = path.join(__dirname, '../src/prompts');
  for (const { step, name, file } of PROMPT_STEPS) {
    const filePath = path.join(promptsDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ ${file} not found — skipping`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const existing = await prisma.promptTemplate.findFirst({ where: { step, isDefault: true } });
    if (!existing) {
      await prisma.promptTemplate.create({ data: { name, step, content, isDefault: true, isActive: true } });
      console.log(`  ✓ ${name} (seeded from ${file})`);
    } else {
      console.log(`  ✓ ${name} (already exists)`);
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
