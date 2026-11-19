import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { initDatabase } from '../server/db.ts';
import { runAssistantChat } from '../server/ai.ts';
import {
  classifyAiProviderError,
  getAiRuntimeConfig,
  getAiUsageForToday,
  getQuotaWindow,
  redactObviousPersonalData,
  releaseAiRequest,
  reserveAiRequest,
} from '../server/ai-policy.ts';

const envKeys = [
  'AI_ENABLED', 'AI_FREE_TIER_CONFIRMED', 'AI_STUDENT_AUDIENCE_APPROVED', 'AI_MODEL', 'AI_DAILY_REQUEST_LIMIT',
  'AI_GLOBAL_DAILY_LIMIT', 'AI_MAX_OUTPUT_TOKENS', 'AI_MAX_INPUT_LENGTH',
  'AI_MAX_CONCURRENT_REQUESTS', 'GEMINI_API_KEY', 'NODE_ENV',
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function enableTestGemini() {
  process.env.AI_ENABLED = 'true';
  process.env.AI_FREE_TIER_CONFIRMED = 'true';
  process.env.AI_STUDENT_AUDIENCE_APPROVED = 'true';
  process.env.AI_MODEL = 'gemini-4-hydrogen';
  process.env.AI_DAILY_REQUEST_LIMIT = '10';
  process.env.AI_GLOBAL_DAILY_LIMIT = '2';
  process.env.AI_MAX_OUTPUT_TOKENS = '650';
  process.env.AI_MAX_INPUT_LENGTH = '2000';
  process.env.AI_MAX_CONCURRENT_REQUESTS = '2';
  process.env.GEMINI_API_KEY = 'unit-test-key';
}

describe('free-first AI configuration and privacy controls', () => {
  it('stays disabled until every server-side free-tier gate and a project cap are configured', () => {
    delete process.env.AI_ENABLED;
    delete process.env.AI_FREE_TIER_CONFIRMED;
    delete process.env.AI_GLOBAL_DAILY_LIMIT;
    delete process.env.GEMINI_API_KEY;
    const disabled = getAiRuntimeConfig();
    expect(disabled.ready).toBe(false);
    expect(disabled.globalDailyLimit).toBe(0);

    enableTestGemini();
    expect(getAiRuntimeConfig().ready).toBe(true);
    delete process.env.AI_STUDENT_AUDIENCE_APPROVED;
    expect(getAiRuntimeConfig().ready).toBe(false);
    process.env.AI_STUDENT_AUDIENCE_APPROVED = 'true';
    process.env.AI_MODEL = 'paid-model-name';
    expect(getAiRuntimeConfig().ready).toBe(false);
  });

  it('redacts obvious identifiers and classifies rate limits without storing provider text', () => {
    const safe = redactObviousPersonalData('Email me at scholar@example.org or call +1 (415) 555-0199; passport number AB1234567.');
    expect(safe).not.toContain('scholar@example.org');
    expect(safe).not.toContain('+1 (415) 555-0199');
    expect(safe).not.toContain('AB1234567');
    expect(classifyAiProviderError(new Error('429 RESOURCE_EXHAUSTED'))).toBe('provider_rate_limited');
    expect(classifyAiProviderError(new Error('internal request id abc'))).toBe('provider_unavailable');
  });

  it('uses Google quota reset time: midnight America/Los_Angeles including daylight saving changes', () => {
    expect(getQuotaWindow(new Date('2026-11-01T07:30:00.000Z'))).toEqual({
      date: '2026-11-01',
      resetAt: '2026-11-02T08:00:00.000Z',
    });
    expect(getQuotaWindow(new Date('2026-03-08T08:30:00.000Z'))).toEqual({
      date: '2026-03-08',
      resetAt: '2026-03-09T07:00:00.000Z',
    });
  });

  it('persists user/global caps and concurrency leases through database reopen', () => {
    process.env.NODE_ENV = 'test';
    enableTestGemini();
    process.env.AI_DAILY_REQUEST_LIMIT = '1';
    process.env.AI_MAX_CONCURRENT_REQUESTS = '1';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofpath-ai-quota-'));
    const dbPath = path.join(tempDir, 'quota.db');
    let db: Database.Database = initDatabase(dbPath);
    try {
      const config = getAiRuntimeConfig();
      const first = reserveAiRequest(db, 'student-a', config);
      expect(first.allowed).toBe(true);
      if (!first.allowed) return;

      expect(reserveAiRequest(db, 'student-b', config)).toEqual({ allowed: false, reason: 'concurrency_limit' });
      releaseAiRequest(db, first.leaseId);
      expect(reserveAiRequest(db, 'student-a', config)).toEqual({ allowed: false, reason: 'user_limit' });
      expect(reserveAiRequest(db, 'student-b', config).allowed).toBe(true);
      expect(getAiUsageForToday(db, 'student-a').usedToday).toBe(1);
      db.close();

      db = initDatabase(dbPath);
      expect(getAiUsageForToday(db, 'student-a').usedToday).toBe(1);
      expect(getAiUsageForToday(db, 'student-b').globalUsedToday).toBe(2);
      const version = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number };
      expect(version.version).toBe(3);
    } finally {
      if (db.open) db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('answers in deterministic guided mode without consent or an enabled provider', async () => {
    process.env.NODE_ENV = 'test';
    process.env.AI_ENABLED = 'false';
    process.env.AI_GLOBAL_DAILY_LIMIT = '0';
    delete process.env.GEMINI_API_KEY;
    const db = initDatabase(':memory:');
    try {
      const result = await runAssistantChat(db, {
        userId: 'student-local-only',
        conversationId: 'conversation-local-only',
        userMessage: 'Please review my CV and next steps.',
        language: 'en',
        profile: null,
        externalAiConsent: false,
      });
      expect(result.responseMode).toBe('guided');
      expect(result.fallbackReason).toBe('consent_required');
      expect(result.reply).toContain('ProofPath Guided Mode');
      expect(result.reply).toContain('do not invent achievements');
      expect(result.groundingRefs.every((ref) => ref.url.startsWith('http'))).toBe(true);
      expect(getAiUsageForToday(db, 'student-local-only').usedToday).toBe(0);
    } finally {
      db.close();
    }
  });
});
