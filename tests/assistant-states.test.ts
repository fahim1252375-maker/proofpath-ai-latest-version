import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { initDatabase } from '../server/db.ts';
import { runAssistantChat } from '../server/ai.ts';
import { getQuotaWindow } from '../server/ai-policy.ts';
import {
  classifyAssistantFallback,
  hasInactiveConsentDecision,
} from '../src/pages/AssistantPage.tsx';

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

describe('assistant copilot fallback state classification', () => {
  it('maps every quota reason to a quota-exhausted state with a Guided Mode fallback', () => {
    for (const reason of ['user_limit', 'global_limit', 'concurrency_limit']) {
      const notice = classifyAssistantFallback(reason);
      expect(notifyKind(notice)).toBe('quota_exhausted');
      expect(notice?.title.toLowerCase()).toContain('quota');
      expect(notice?.detail).toContain('Guided Mode');
      expect(notice?.detail).toContain('midnight Pacific');
      expect(notice?.detail).not.toContain('Gemini answered');
    }
  });

  it('maps operator-gate reasons to a provider-off state, distinct from quota', () => {
    for (const reason of [
      'disabled',
      'free_tier_unconfirmed',
      'student_audience_unapproved',
      'model_unavailable',
      'api_key_missing',
      'global_limit_unconfigured',
    ]) {
      const notice = classifyAssistantFallback(reason);
      expect(notifyKind(notice)).toBe('provider_off');
      expect(notice?.title).toContain('operator');
      expect(notice?.detail).toContain('Guided Mode');
    }
  });

  it('maps missing consent to a consent-required state', () => {
    const notice = classifyAssistantFallback('consent_required');
    expect(notifyKind(notice)).toBe('consent_required');
    expect(notice?.title.toLowerCase()).toContain('consent');
    expect(notice?.detail).toContain('Guided Mode');
    expect(notifyKind(notice)).not.toBe('outdated_consent');
  });

  it('tells the user their earlier consent is outdated when a previous decision exists', () => {
    const notice = classifyAssistantFallback('consent_required', {
      previousConsentAt: '2026-01-15T10:00:00.000Z',
    });
    expect(notifyKind(notice)).toBe('outdated_consent');
    expect(notice?.title.toLowerCase()).toContain('outdated');
    expect(notice?.detail).toContain('2026-01-15');
    expect(notice?.detail).toContain('the consent box again');
    expect(notice?.detail).toContain('Guided Mode');
  });

  it('keeps provider failures honest and separate from fabricated answers', () => {
    const rateLimited = classifyAssistantFallback('provider_rate_limited');
    expect(notifyKind(rateLimited)).toBe('provider_unavailable');
    expect(rateLimited?.detail).toContain('rate-limited');

    const unreachable = classifyAssistantFallback('provider_unavailable');
    expect(notifyKind(unreachable)).toBe('provider_unavailable');
    expect(unreachable?.detail).toContain('nothing was sent externally');
  });

  it('returns no notice when the server reports no fallback', () => {
    expect(classifyAssistantFallback(null)).toBeNull();
    expect(classifyAssistantFallback(undefined)).toBeNull();
    expect(classifyAssistantFallback('')).toBeNull();
  });

  it('flags an inactive consent decision only when a timestamp exists without active consent', () => {
    expect(hasInactiveConsentDecision({ consent: false, consentUpdatedAt: '2026-01-15T10:00:00.000Z' })).toBe(true);
    expect(hasInactiveConsentDecision({ consent: true, consentUpdatedAt: '2026-01-15T10:00:00.000Z' })).toBe(false);
    expect(hasInactiveConsentDecision({ consent: false, consentUpdatedAt: null })).toBe(false);
    expect(hasInactiveConsentDecision(null)).toBe(false);
  });
});

describe('assistant server states behind the UI messages', () => {
  function enableGemini() {
    process.env.NODE_ENV = 'test';
    process.env.AI_ENABLED = 'true';
    process.env.AI_FREE_TIER_CONFIRMED = 'true';
    process.env.AI_STUDENT_AUDIENCE_APPROVED = 'true';
    process.env.AI_MODEL = 'gemini-4-hydrogen';
    process.env.AI_DAILY_REQUEST_LIMIT = '10';
    process.env.AI_GLOBAL_DAILY_LIMIT = '5';
    process.env.AI_MAX_OUTPUT_TOKENS = '650';
    process.env.AI_MAX_INPUT_LENGTH = '2000';
    process.env.AI_MAX_CONCURRENT_REQUESTS = '2';
    process.env.GEMINI_API_KEY = 'unit-test-key';
  }

  it('returns consent_required with a guided reply when consent is missing', async () => {
    process.env.NODE_ENV = 'test';
    enableGemini();
    process.env.AI_ENABLED = 'false'; // provider off, but consent gate is checked first
    const db = initDatabase(':memory:');
    try {
      const result = await runAssistantChat(db, {
        userId: 'u-consent',
        conversationId: 'c-consent',
        userMessage: 'What documents should I prepare?',
        language: 'en',
        profile: null,
        externalAiConsent: false,
      });
      expect(result.fallbackReason).toBe('consent_required');
      expect(result.responseMode).toBe('guided');
      expect(result.reply).toContain('ProofPath Guided Mode');
      expect(result.usage.usedToday).toBe(0);
    } finally {
      db.close();
    }
  });

  it('reports the user quota as exhausted without contacting Gemini', async () => {
    process.env.NODE_ENV = 'test';
    enableGemini();
    process.env.AI_DAILY_REQUEST_LIMIT = '1';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofpath-assistant-states-'));
    const db = initDatabase(path.join(tempDir, 'states.db'));
    try {
      const { date } = getQuotaWindow();
      db.prepare(
        "INSERT INTO ai_daily_usage (quota_date, scope_key, request_count) VALUES (?, 'user:u-quota', 1)"
      ).run(date);

      const result = await runAssistantChat(db, {
        userId: 'u-quota',
        conversationId: 'c-quota',
        userMessage: 'Review my CV next steps.',
        language: 'en',
        profile: null,
        externalAiConsent: true,
      });
      expect(result.fallbackReason).toBe('user_limit');
      expect(result.responseMode).toBe('guided');
      expect(result.usage.usedToday).toBe(1);
      expect(result.usage.dailyLimit).toBe(1);
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports the global cap as exhausted without contacting Gemini', async () => {
    process.env.NODE_ENV = 'test';
    enableGemini();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofpath-assistant-states-'));
    const db = initDatabase(path.join(tempDir, 'states-global.db'));
    try {
      const { date } = getQuotaWindow();
      db.prepare(
        "INSERT INTO ai_daily_usage (quota_date, scope_key, request_count) VALUES (?, 'global', 5)"
      ).run(date);

      const result = await runAssistantChat(db, {
        userId: 'u-global',
        conversationId: 'c-global',
        userMessage: 'Draft my statement outline.',
        language: 'en',
        profile: null,
        externalAiConsent: true,
      });
      expect(result.fallbackReason).toBe('global_limit');
      expect(result.responseMode).toBe('guided');
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports the operator gate when external AI is disabled', async () => {
    process.env.NODE_ENV = 'test';
    enableGemini();
    process.env.AI_ENABLED = 'false';
    process.env.AI_FREE_TIER_CONFIRMED = 'false';
    process.env.AI_GLOBAL_DAILY_LIMIT = '0';
    const db = initDatabase(':memory:');
    try {
      const result = await runAssistantChat(db, {
        userId: 'u-off',
        conversationId: 'c-off',
        userMessage: 'Compare saved opportunities.',
        language: 'en',
        profile: null,
        externalAiConsent: true,
      });
      expect(result.fallbackReason).toBe('disabled');
      expect(result.responseMode).toBe('guided');
      expect(result.usage.usedToday).toBe(0);
    } finally {
      db.close();
    }
  });
});

function notifyKind(notice: ReturnType<typeof classifyAssistantFallback>) {
  return notice?.kind ?? 'missing';
}
