/**
 * 24-hour in-memory probe cache for model capabilities.
 *
 * Stores results of probeModelCapabilities() for model IDs not in MODEL_REGISTRY.
 * Cache is process-local — resets on every server restart. Acceptable for v0.4 single-process
 * deployment. Upgrade path: replace getFromCache/setInCache with Redis or Supabase KV calls
 * when horizontal scaling is introduced. Callers do not need to change.
 */

import type { ModelCapabilities } from '../config/modelRegistry';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  result: ModelCapabilities;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export function getFromCache(modelId: string): ModelCapabilities | null {
  const entry = cache.get(modelId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(modelId);
    return null;
  }
  return entry.result;
}

export function setInCache(modelId: string, result: ModelCapabilities): void {
  cache.set(modelId, { result, timestamp: Date.now() });
}
