import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export const AI_CONSENT_VERSION = '2026-11-19';
export const DEFAULT_AI_MODEL = 'gemini-4-hydrogen';

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export interface AiRuntimeConfig {
  enabled: boolean;
  freeTierConfirmed: boolean;
  studentAudienceApproved: boolean;
  model: string;
  modelAllowed: boolean;
  userDailyLimit: number;
  globalDailyLimit: number;
  maxOutputTokens: number;
  maxInputLength: number;
  maxConcurrentRequests: number;
  apiKeyConfigured: boolean;
  ready: boolean;
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  const model = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
  const enabled = isEnabled(process.env.AI_ENABLED);
  const freeTierConfirmed = isEnabled(process.env.AI_FREE_TIER_CONFIRMED);
  const studentAudienceApproved = isEnabled(process.env.AI_STUDENT_AUDIENCE_APPROVED);
  const modelAllowed = model === DEFAULT_AI_MODEL;
  const apiKeyConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  const userDailyLimit = boundedInteger(process.env.AI_DAILY_REQUEST_LIMIT, 10, 1, 1000);
  // Google quota varies by project and model. Stay disabled until the operator
  // enters a limit no higher than the current Free-tier quota in AI Studio.
  const globalDailyLimit = boundedInteger(process.env.AI_GLOBAL_DAILY_LIMIT, 0, 0, 100000);
  const maxOutputTokens = boundedInteger(process.env.AI_MAX_OUTPUT_TOKENS, 650, 128, 2048);
  const maxInputLength = boundedInteger(process.env.AI_MAX_INPUT_LENGTH, 2000, 128, 12000);
  const maxConcurrentRequests = boundedInteger(process.env.AI_MAX_CONCURRENT_REQUESTS, 2, 1, 8);

  return {
    enabled,
    freeTierConfirmed,
    studentAudienceApproved,
    model,
    modelAllowed,
    userDailyLimit,
    globalDailyLimit,
    maxOutputTokens,
    maxInputLength,
    maxConcurrentRequests,
    apiKeyConfigured,
    ready: enabled && freeTierConfirmed && studentAudienceApproved && modelAllowed && apiKeyConfigured && globalDailyLimit > 0,
  };
}

function pacificParts(timestamp: number): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function pacificOffsetMs(timestamp: number): number {
  const parts = pacificParts(timestamp);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - Math.floor(timestamp / 1000) * 1000;
}

export function getQuotaWindow(now = new Date()): { date: string; resetAt: string } {
  const parts = pacificParts(now.getTime());
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const nextLocalDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const targetLocalMidnightAsUtc = Date.UTC(
    nextLocalDay.getUTCFullYear(), nextLocalDay.getUTCMonth(), nextLocalDay.getUTCDate(), 0, 0, 0
  );
  let resetMs = targetLocalMidnightAsUtc - pacificOffsetMs(targetLocalMidnightAsUtc);
  // Recheck the offset at the candidate instant so a DST transition is handled.
  resetMs = targetLocalMidnightAsUtc - pacificOffsetMs(resetMs);
  return { date, resetAt: new Date(resetMs).toISOString() };
}

export type AiReservation =
  | { allowed: true; leaseId: string; usedToday: number; globalUsedToday: number }
  | { allowed: false; reason: 'disabled' | 'free_tier_unconfirmed' | 'student_audience_unapproved' | 'model_unavailable' | 'api_key_missing' | 'global_limit_unconfigured' | 'user_limit' | 'global_limit' | 'concurrency_limit' };

export function reserveAiRequest(
  db: Database.Database,
  userId: string,
  config: AiRuntimeConfig,
  now = new Date()
): AiReservation {
  if (!config.enabled) return { allowed: false, reason: 'disabled' };
  if (!config.freeTierConfirmed) return { allowed: false, reason: 'free_tier_unconfirmed' };
  if (!config.studentAudienceApproved) return { allowed: false, reason: 'student_audience_unapproved' };
  if (!config.modelAllowed) return { allowed: false, reason: 'model_unavailable' };
  if (!config.apiKeyConfigured) return { allowed: false, reason: 'api_key_missing' };
  if (config.globalDailyLimit < 1) return { allowed: false, reason: 'global_limit_unconfigured' };

  const { date } = getQuotaWindow(now);
  const userScope = `user:${userId}`;
  const reserve = db.transaction((): AiReservation => {
    const nowMs = now.getTime();
    db.prepare('DELETE FROM ai_request_leases WHERE expires_at <= ?').run(nowMs);
    const active = db.prepare('SELECT COUNT(*) AS count FROM ai_request_leases').get() as { count: number };
    if (active.count >= config.maxConcurrentRequests) {
      return { allowed: false, reason: 'concurrency_limit' };
    }

    const readCount = db.prepare('SELECT request_count FROM ai_daily_usage WHERE quota_date = ? AND scope_key = ?');
    const userCount = (readCount.get(date, userScope) as { request_count: number } | undefined)?.request_count || 0;
    if (userCount >= config.userDailyLimit) return { allowed: false, reason: 'user_limit' };
    const globalCount = (readCount.get(date, 'global') as { request_count: number } | undefined)?.request_count || 0;
    if (globalCount >= config.globalDailyLimit) return { allowed: false, reason: 'global_limit' };

    const leaseId = `ail_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO ai_daily_usage (quota_date, scope_key, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT(quota_date, scope_key) DO UPDATE SET request_count = request_count + 1
    `).run(date, userScope);
    db.prepare(`
      INSERT INTO ai_daily_usage (quota_date, scope_key, request_count)
      VALUES (?, 'global', 1)
      ON CONFLICT(quota_date, scope_key) DO UPDATE SET request_count = request_count + 1
    `).run(date);
    db.prepare('INSERT INTO ai_request_leases (id, expires_at) VALUES (?, ?)').run(leaseId, nowMs + 90_000);
    return { allowed: true, leaseId, usedToday: userCount + 1, globalUsedToday: globalCount + 1 };
  });

  return reserve.immediate();
}

export function releaseAiRequest(db: Database.Database, leaseId: string): void {
  db.prepare('DELETE FROM ai_request_leases WHERE id = ?').run(leaseId);
}

export function getAiUsageForToday(db: Database.Database, userId: string, now = new Date()) {
  const { date, resetAt } = getQuotaWindow(now);
  const user = db.prepare('SELECT request_count FROM ai_daily_usage WHERE quota_date = ? AND scope_key = ?')
    .get(date, `user:${userId}`) as { request_count: number } | undefined;
  const global = db.prepare('SELECT request_count FROM ai_daily_usage WHERE quota_date = ? AND scope_key = ?')
    .get(date, 'global') as { request_count: number } | undefined;
  return {
    date,
    resetAt,
    usedToday: user?.request_count || 0,
    globalUsedToday: global?.request_count || 0,
  };
}

export function redactObviousPersonalData(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:passport|national\s*(?:id|identity)|nid|student\s*id)\s*(?:number|no\.?|#|:)?\s*[A-Z0-9-]{5,}\b/gi, '[identity number removed]')
    .replace(/\+?\d[\d ().-]{7,}\d/g, '[phone number removed]');
}

export function classifyAiProviderError(error: unknown): 'provider_rate_limited' | 'provider_unavailable' {
  const message = error instanceof Error ? error.message : String(error || '');
  return /429|resource.?exhausted|rate.?limit|quota/i.test(message)
    ? 'provider_rate_limited'
    : 'provider_unavailable';
}
