-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "llmProvider" TEXT NOT NULL DEFAULT 'Gemini',
    "llmModel" TEXT NOT NULL DEFAULT '',
    "llmApiKeyEnc" TEXT NOT NULL DEFAULT '',
    "jiraUrl" TEXT NOT NULL DEFAULT '',
    "jiraProjectKey" TEXT NOT NULL DEFAULT '',
    "jiraEmail" TEXT NOT NULL DEFAULT '',
    "jiraApiTokenEnc" TEXT NOT NULL DEFAULT '',
    "xrayClientId" TEXT NOT NULL DEFAULT '',
    "xrayClientSecEnc" TEXT NOT NULL DEFAULT '',
    "xrayBatchSize" INTEGER NOT NULL DEFAULT 10,
    "xrayBatchDelayMs" INTEGER NOT NULL DEFAULT 1000,
    "xrayMaxRetries" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authHeader" TEXT NOT NULL DEFAULT 'Bearer',
    "apiKeyEnc" TEXT NOT NULL DEFAULT '',
    "compatibility" TEXT NOT NULL DEFAULT 'openai',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMModel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "jiraProjectKey" TEXT NOT NULL DEFAULT '',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "owner" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stakeholder" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'Reviewer',
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "requirementText" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL,
    "llmModel" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'COMPLETED',
    "enhancement" JSONB,
    "scenarios" JSONB,
    "testCases" JSONB,
    "automation" JSONB,
    "totalTestCases" INTEGER NOT NULL DEFAULT 0,
    "totalScenarios" INTEGER NOT NULL DEFAULT 0,
    "xrayPushStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LLMProvider_name_key" ON "LLMProvider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LLMModel_providerId_modelId_key" ON "LLMModel"("providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Stakeholder_projectId_email_key" ON "Stakeholder"("projectId", "email");

-- AddForeignKey
ALTER TABLE "LLMModel" ADD CONSTRAINT "LLMModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "LLMProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
