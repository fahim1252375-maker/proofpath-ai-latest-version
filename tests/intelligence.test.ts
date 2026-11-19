import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type http from 'node:http';
import { initDatabase } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { scoreSourceCredibility } from '../server/source-credibility.ts';
import { insertTestOpportunities } from './helpers/test-opportunities.ts';
import type Database from 'better-sqlite3';

let server: http.Server;
let baseUrl = '';
let db: Database.Database;
const previousCronSecret = process.env.MONITORING_CRON_SECRET;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONITORING_CRON_SECRET = '';
  db = initDatabase(':memory:');
  insertTestOpportunities(db);
  const app = createApp(db);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        baseUrl = 'http://127.0.0.1:' + address.port;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  if (previousCronSecret === undefined) delete process.env.MONITORING_CRON_SECRET;
  else process.env.MONITORING_CRON_SECRET = previousCronSecret;
});

describe('ProofPath AI Trust Intelligence', () => {
  it('scores URL signals without treating HTTPS or host alignment as proof of legitimacy', () => {
    const listedHost = scoreSourceCredibility(
      'https://admissions.example.edu/scholarships',
      'https://example.edu'
    );
    const unrelatedHost = scoreSourceCredibility(
      'https://unknown-awards.example.net/apply',
      'https://example.edu'
    );

    expect(listedHost.score).toBe(90);
    expect(listedHost.level).toBe('strong');
    expect(listedHost.caveat).toContain('do not prove ownership');
    expect(unrelatedHost.score).toBe(35);
    expect(unrelatedHost.level).toBe('limited');
    expect(unrelatedHost.signals.some((signal) => signal.includes('differs'))).toBe(true);
  });

  it('exposes public opportunity intelligence and creates migration 2 tables', async () => {
    const response = await fetch(baseUrl + '/api/opportunities/opp_test_one/intelligence');
    expect(response.status).toBe(200);
    const result = await response.json() as {
      sourceAssessment: { score: number; caveat: string };
      changes: unknown[];
      communitySignals: { totalReports: number; disclaimer: string };
    };
    expect(result.sourceAssessment.score).toBeGreaterThan(0);
    expect(result.sourceAssessment.caveat).toContain('not prove');
    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.communitySignals.disclaimer).toContain('not verified findings');

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((table) => table.name));
    expect(tableNames.has('watchlist_preferences')).toBe(true);
    expect(tableNames.has('opportunity_snapshots')).toBe(true);
    expect(tableNames.has('opportunity_change_events')).toBe(true);
    expect(tableNames.has('monitoring_runs')).toBe(true);
  });

  it('protects personal trust, watchlist, eligibility, and comparison endpoints', async () => {
    const endpoints = [
      '/api/watchlist',
      '/api/trust/summary',
      '/api/eligibility/explain/opp_test_one',
    ];
    for (const endpoint of endpoints) {
      const response = await fetch(baseUrl + endpoint);
      expect(response.status).toBe(401);
    }

    const compare = await fetch(baseUrl + '/api/verifications/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportIds: ['rep_seed_chevening', 'rep_seed_chevening_2'] }),
    });
    expect(compare.status).toBe(401);
  });

  it('refuses to run scheduled monitoring until a strong shared secret is configured', async () => {
    const response = await fetch(baseUrl + '/api/internal/monitoring/run', { method: 'POST' });
    expect(response.status).toBe(503);
    const payload = await response.json() as { error: string };
    expect(payload.error).toContain('not configured');
  });

  it('keeps trust analytics restricted to moderators and administrators', async () => {
    const response = await fetch(baseUrl + '/api/admin/trust-analytics');
    expect(response.status).toBe(401);
  });
});
