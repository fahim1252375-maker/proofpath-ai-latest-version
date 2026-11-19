import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import type Database from 'better-sqlite3';
import { initDatabase } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { runMonitoringCycle } from '../server/monitoring.ts';
import { insertTestOpportunities } from './helpers/test-opportunities.ts';

let server: http.Server;
let baseUrl: string;
let tempDir: string;
let db: Database.Database;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofpath-notifications-'));
  db = initDatabase(path.join(tempDir, 'notifications.db'));
  insertTestOpportunities(db);
  const app = createApp(db);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function extractCookie(res: Response): string {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function registerStudent(name: string) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}_${Date.now()}@example.edu`,
      password: 'StrongPassword123!',
    }),
  });
  expect(res.status).toBe(201);
  const data = await res.json();
  return { cookie: extractCookie(res), csrf: data.csrfToken as string, userId: data.user.id as string };
}

async function listNotifications(cookie: string) {
  const res = await fetch(`${baseUrl}/api/notifications`, { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return (await res.json()).items as Array<{ id: string; type: string; title: string; message: string }>;
}

describe('notifications are created only from real events', () => {
  it('no longer seeds the demo welcome notification', () => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM notifications').get() as { count: number };
    expect(count.count).toBe(0);
    const seeded = db
      .prepare("SELECT COUNT(*) AS count FROM notifications WHERE id = 'notif_welcome_1'")
      .get() as { count: number };
    expect(seeded.count).toBe(0);
  });

  it('account registration (security) creates a notification for the acting user', async () => {
    const { cookie } = await registerStudent('Security Event');
    const items = await listNotifications(cookie);
    const created = items.find((n) => n.type === 'security' && n.title === 'Account Created');
    expect(created).toBeTruthy();
  });

  it('a URL verification run (verification) creates a notification for the acting user', async () => {
    const { cookie, csrf } = await registerStudent('Verify Event');
    const res = await fetch(`${baseUrl}/api/verify/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ url: 'https://example.org/program-a' }),
    });
    expect(res.status).toBe(201);
    const items = await listNotifications(cookie);
    const created = items.find((n) => n.type === 'verification' && n.title.startsWith('Local review:'));
    expect(created).toBeTruthy();
  });

  it('creating a tracked application (application) creates a notification', async () => {
    const { cookie, csrf } = await registerStudent('App Create Event');
    const res = await fetch(`${baseUrl}/api/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        customTitle: 'Example Opportunity Alpha',
        organization: 'Example Organization A',
        deadline: '2099-01-05', // far future: no deadline sweep involvement
        priority: 'medium',
        status: 'researching',
      }),
    });
    expect(res.status).toBe(201);
    const items = await listNotifications(cookie);
    const created = items.find((n) => n.type === 'application' && n.title === 'Application Added');
    expect(created).toBeTruthy();
  });

  it('changing an application status (application) creates a notification', async () => {
    const { cookie, csrf } = await registerStudent('App Status Event');
    const created = await fetch(`${baseUrl}/api/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        customTitle: 'Example Opportunity Beta',
        organization: 'Example Organization B',
        deadline: '2099-01-05',
        status: 'researching',
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const patched = await fetch(`${baseUrl}/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ status: 'preparing' }),
    });
    expect(patched.status).toBe(200);
    const items = await listNotifications(cookie);
    const statusUpdate = items.find(
      (n) => n.type === 'application' && n.title === 'Application Status Updated'
    );
    expect(statusUpdate).toBeTruthy();
  });

  it('the deadline sweep creates a deadline notification for a near stored application', async () => {
    const { cookie, csrf } = await registerStudent('Deadline Event');
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl}/api/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        customTitle: 'Example Opportunity Gamma',
        organization: 'Example Organization C',
        deadline: soon,
        status: 'preparing',
      }),
    });
    expect(res.status).toBe(201);
    const items = await listNotifications(cookie);
    const deadlineNote = items.find((n) => n.type === 'deadline' && n.title.startsWith('Deadline in'));
    expect(deadlineNote).toBeTruthy();
  });

  it('a monitored page change (watcher) creates a verification notification for the watcher', async () => {
    const demoUser = 'usr_student_demo';
    // Point the fixture at a URL that serves a stable 200 page.
    db.prepare("UPDATE opportunities SET official_url = 'https://example.org' WHERE id = 'opp_test_one'").run();
    db.prepare(
      `INSERT INTO saved_opportunities (id, user_id, opportunity_id, created_at)
       VALUES ('saved_watch_1', ?, 'opp_test_one', ?)`
    ).run(demoUser, new Date().toISOString());
    // Seed a stale snapshot so the next cycle detects a content change.
    db.prepare(
      `INSERT INTO opportunity_snapshots
       (opportunity_id, content_hash, page_title, text_excerpt, final_url, last_http_status, last_checked_at, last_error)
       VALUES ('opp_test_one', 'stale-hash-from-previous-check', 'Old Title', 'old excerpt', 'https://example.org', 200, ?, NULL)`
    ).run(new Date().toISOString());

    const result = await runMonitoringCycle(db, { limit: 4 });
    expect(result.changedCount).toBeGreaterThanOrEqual(1);
    const items = db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'verification'")
      .all(demoUser) as Array<{ title: string; link: string }>;
    const watcherNote = items.find((n) => n.title.startsWith('Opportunity page updated'));
    expect(watcherNote).toBeTruthy();
  });

  it('an admin moderation update creates a moderation notification for the report owner', async () => {
    const { cookie, csrf } = await registerStudent('Moderation Event');
    const report = await fetch(`${baseUrl}/api/community-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        submittedUrl: 'https://example.org/suspicious-page',
        reason: 'scam_fee',
        details: 'This page asked for an application fee before any review, which looks like a scam pattern.',
      }),
    });
    expect(report.status).toBe(201);
    const { id } = (await report.json()) as { id: string };

    const modLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'moderator@proofpath.ai', password: 'Moderator@2026!' }),
    });
    expect(modLogin.status).toBe(200);
    const modCookie = extractCookie(modLogin);
    const modCsrf = ((await modLogin.json()) as { csrfToken: string }).csrfToken;

    const patched = await fetch(`${baseUrl}/api/admin/community-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: modCookie, 'X-CSRF-Token': modCsrf },
      body: JSON.stringify({ status: 'resolved_valid', resolutionNotes: 'Confirmed the fee request.' }),
    });
    expect(patched.status).toBe(200);
    const items = await listNotifications(cookie);
    const modNote = items.find((n) => n.type === 'moderation' && n.title === 'Community Report Reviewed');
    expect(modNote).toBeTruthy();
  });

  it('a disabled in_app_applications preference suppresses application notifications', async () => {
    const { cookie, csrf } = await registerStudent('Pref Off');
    const prefRes = await fetch(`${baseUrl}/api/notifications/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        inAppDeadlines: true,
        inAppVerifications: true,
        inAppApplications: false,
        inAppSecurity: true,
        deadlineDaysBefore: 14,
      }),
    });
    expect(prefRes.status).toBe(200);

    const before = await listNotifications(cookie);
    const created = await fetch(`${baseUrl}/api/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        customTitle: 'Example Opportunity Delta',
        organization: 'Example Organization D',
        deadline: '2099-01-05',
        status: 'researching',
      }),
    });
    expect(created.status).toBe(201);
    const after = await listNotifications(cookie);
    expect(after.filter((n) => n.type === 'application')).toEqual([]);
    // No other noise was produced either: the stored event made no insert.
    expect(after.length).toBe(before.length);
  });

  it('a missing preference row still notifies (missing row means enabled)', async () => {
    const { cookie, csrf, userId } = await registerStudent('Pref Missing');
    db.prepare('DELETE FROM notification_preferences WHERE user_id = ?').run(userId);
    const changed = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ currentPassword: 'StrongPassword123!', newPassword: 'NewerPassword456!' }),
    });
    expect(changed.status).toBe(200);
    const items = await listNotifications(cookie);
    const securityNote = items.find((n) => n.type === 'security' && n.title === 'Password changed');
    expect(securityNote).toBeTruthy();
  });

  it('a non-event request creates no notification', async () => {
    const { cookie } = await registerStudent('Non Event');
    await listNotifications(cookie); // read endpoint with no stored events
    await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: cookie } });
    const after = await listNotifications(cookie);
    expect(after.filter((n) => n.type !== 'security')).toEqual([]);
    // The only notification ever created for this user is the registration event itself.
    expect(after.length).toBe(1);
    expect(after[0].type).toBe('security');
  });
});
