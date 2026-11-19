import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { initDatabase, mapOpportunityRow } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { assertSafePublicUrl } from '../server/ssrf.ts';
import { validateMagicBytes } from '../server/security.ts';
import { buildTrustProfile, evaluateEligibility } from '../server/eligibility.ts';
import { buildEvidenceRecords, runVerificationEngine } from '../server/ai.ts';
import { insertTestOpportunities } from './helpers/test-opportunities.ts';
import type Database from 'better-sqlite3';

let server: http.Server;
let baseUrl: string;
let tempDir: string;
let dbPath: string;
let db: Database.Database;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofpath-test-'));
  dbPath = path.join(tempDir, 'test.db');
  db = initDatabase(dbPath);
  expect(db.prepare('SELECT COUNT(*) AS count FROM opportunities').get()).toMatchObject({ count: 0 });
  expect(db.prepare('SELECT COUNT(*) AS count FROM verification_reports').get()).toMatchObject({ count: 0 });
  insertTestOpportunities(db);
  const app = createApp(db);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
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
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0] || '';
}

describe('ProofPath AI Enterprise API & Security Suite', () => {
  it('returns healthy status and public statistics reflect stored status', async () => {
    const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
    expect(health.status).toBe('ok');
    expect(health.database).toBe('connected');

    const stats = await fetch(`${baseUrl}/api/public/stats`).then((r) => r.json());
    expect(stats.verifiedOpportunities).toBe(0);
    expect(stats.totalOpportunities).toBeGreaterThan(0);
    expect(stats.verificationReports).toBe(0);
    expect(stats.countriesCovered).toBeGreaterThanOrEqual(4);
  });

  it('registers a student, enforces auth + CSRF, persists profile & applications across DB reopen', async () => {
    const email = `teststudent_${Date.now()}@example.edu`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Scholar',
        email,
        password: 'StrongPassword123!',
        preferredLanguage: 'bn',
      }),
    });
    expect(regRes.status).toBe(201);
    const cookie = extractCookie(regRes);
    const regData = await regRes.json();
    expect(regData.user.role).toBe('student');
    expect(regData.csrfToken).toBeTruthy();

    // Duplicate registration fails with 409
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Scholar',
        email,
        password: 'StrongPassword123!',
      }),
    });
    expect(dupRes.status).toBe(409);

    // State-changing request without CSRF fails with 403
    const noCsrf = await fetch(`${baseUrl}/api/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ nationality: 'Bangladesh' }),
    });
    expect(noCsrf.status).toBe(403);

    // Update profile with CSRF succeeds
    const profRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': regData.csrfToken,
      },
      body: JSON.stringify({
        nationality: 'Bangladesh',
        countryOfResidence: 'Bangladesh',
        age: 23,
        educationLevel: 'masters',
        gpa: 3.8,
        gpaScale: 4.0,
        englishProficiency: 'IELTS',
        englishScore: '7.5',
        financialNeed: 'full_funding',
        academicInterests: ['AI'],
        targetCountries: ['United Kingdom'],
      }),
    });
    expect(profRes.status).toBe(200);

    // Create application
    const appRes = await fetch(`${baseUrl}/api/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': regData.csrfToken,
      },
      body: JSON.stringify({
        customTitle: 'Example Opportunity Alpha Application',
        organization: 'UK FCDO',
        status: 'preparing',
        deadline: '2027-11-04',
        priority: 'high',
      }),
    });
    expect(appRes.status).toBe(201);

    // Student cannot access admin routes (403)
    const adminForbidden = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: cookie },
    });
    expect(adminForbidden.status).toBe(403);
    const draftListForbidden = await fetch(`${baseUrl}/api/admin/opportunities`, {
      headers: { Cookie: cookie },
    });
    expect(draftListForbidden.status).toBe(403);

    // Verify persistence on disk by opening second read-only handle
    const dbCheck = initDatabase(dbPath);
    const savedApp = dbCheck
      .prepare('SELECT custom_title FROM applications WHERE custom_title = ?')
      .get('Example Opportunity Alpha Application') as { custom_title: string } | undefined;
    expect(savedApp?.custom_title).toBe('Example Opportunity Alpha Application');
    dbCheck.close();
  });

  it('maps only retrieved evidence URLs to the specific claims that cite them', () => {
    const claims = [
      {
        claim: 'The program requires an application fee.',
        verdict: 'CONTRADICTED' as const,
        explanation: 'The official source states that applications are free.',
        evidenceExcerpt: 'Applications are free of charge.',
        sourceUrl: 'https://example.org/fees/',
      },
      {
        claim: 'A separate claim cites an invented URL.',
        verdict: 'VERIFIED' as const,
        explanation: 'This source was not returned by retrieval.',
        evidenceExcerpt: 'Unmatched excerpt.',
        sourceUrl: 'https://not-retrieved.example/fake',
      },
      {
        claim: 'The deadline is published on the program page.',
        verdict: 'SUPPORTED' as const,
        explanation: 'A retrieved page contains the deadline.',
        evidenceExcerpt: 'Applications close on 30 June.',
        sourceUrl: 'https://example.org/deadline',
      },
    ];

    const records = buildEvidenceRecords(
      claims,
      [
        { url: 'https://example.org/fees', title: 'Fee policy' },
        { url: 'https://example.org/deadline', title: 'Program deadline' },
      ],
      '2026-11-15T12:00:00.000Z'
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.claimIndex)).toEqual([0, 2]);
    expect(records.map((record) => record.stance)).toEqual(['contradicts', 'supports']);
    expect(records[0].sourceTitle).toBe('Fee policy');
    expect(records[1].excerpt).toContain('30 June');
  });

  it('keeps signed-in verification reports out of the public report feed', async () => {
    const privateReportId = 'rep_private_feed_regression';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO verification_reports (
        id, user_id, opportunity_id, input_type, submitted_url, submitted_title, submitted_text,
        file_name, file_mime, overall_status, summary, extracted_info_json, claims_json,
        risk_indicators_json, confidence_limitations, recommended_actions_json, is_saved, created_at
      ) VALUES (?, 'usr_student_demo', NULL, 'url', NULL, 'Private regression report', NULL,
        NULL, NULL, 'VERIFIED', 'Private summary', '{}', '[]', '[]', '', '[]', 1, ?)
    `).run(privateReportId, now);

    const publicFeed = await fetch(`${baseUrl}/api/verifications?scope=public`).then((response) => response.json());
    expect(publicFeed.items).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM verification_reports WHERE id = 'rep_seed_chevening'").get()).toMatchObject({ count: 0 });

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@proofpath.ai', password: 'Student@2026!' }),
    });
    expect(login.status).toBe(200);
    const mine = await fetch(`${baseUrl}/api/verifications?scope=mine`, {
      headers: { Cookie: extractCookie(login) },
    }).then((response) => response.json());
    expect(mine.items.some((item: { id: string }) => item.id === privateReportId)).toBe(true);
  });

  it('does not retain uploaded file bytes or filename metadata in verification reports', async () => {
    const report = await runVerificationEngine(db, 'usr_student_demo', {
      inputType: 'file',
      fileName: 'private-identity-document.pdf',
      fileMime: 'application/pdf',
      fileBuffer: Buffer.from('%PDF-1.7 test fixture'),
    });
    expect(report.overallStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(report.submittedTitle).toBe('Uploaded document');
    expect(report.fileName).toBeNull();
    expect(report.summary).toContain('contents were not extracted');

    const stored = db.prepare(
      'SELECT submitted_title, submitted_text, file_name, file_mime FROM verification_reports WHERE id = ?'
    ).get(report.id) as { submitted_title: string; submitted_text: string | null; file_name: string | null; file_mime: string | null };
    expect(stored).toEqual({
      submitted_title: 'Uploaded document',
      submitted_text: null,
      file_name: null,
      file_mime: null,
    });
  });

  it('describes domain suffixes as signals rather than proof of institutional status', () => {
    const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get('opp_test_one') as Record<string, unknown>;
    const opportunity = mapOpportunityRow(row);
    const trust = buildTrustProfile(
      { ...opportunity, officialUrl: 'https://sample-foundation.org/program' },
      { reportCount: 0, evidenceCount: 0, flagCount: 0 }
    );

    expect(trust.domainClassification).toContain('nonprofit status is not established');
    expect(trust.domainClassification).not.toContain('Official Foundation');
    expect(trust.riskSummary).toContain('Available verification evidence is limited or insufficient');
  });

  it('allows an authenticated user to change their password and revokes other sessions', async () => {
    const email = `password_change_${Date.now()}@example.edu`;
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Password Test', email, password: 'OriginalPass123!' }),
    });
    expect(registration.status).toBe(201);
    const registrationData = await registration.json();
    const cookie = extractCookie(registration);
    const userId = registrationData.user.id as string;

    const secondLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'OriginalPass123!' }),
    });
    expect(secondLogin.status).toBe(200);
    const secondCookie = extractCookie(secondLogin);

    const wrongPassword = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': registrationData.csrfToken,
      },
      body: JSON.stringify({ currentPassword: 'WrongPassword!', newPassword: 'NewSecurePass456!' }),
    });
    expect(wrongPassword.status).toBe(400);

    const changed = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': registrationData.csrfToken,
      },
      body: JSON.stringify({ currentPassword: 'OriginalPass123!', newPassword: 'NewSecurePass456!' }),
    });
    expect(changed.status).toBe(200);
    expect((await changed.json()).revokedOtherSessions).toBeGreaterThanOrEqual(1);

    const currentSession = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    const revokedSession = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: secondCookie } });
    expect(currentSession.status).toBe(200);
    expect(revokedSession.status).toBe(200);
    expect((await currentSession.json()).user.id).toBe(userId);
    expect((await revokedSession.json()).user).toBeNull();
  });

  it('supports opportunity search, filtering, and side-by-side comparison', async () => {
    const searchRes = await fetch(`${baseUrl}/api/opportunities?q=Example Opportunity Alpha&category=scholarship`).then((r) =>
      r.json()
    );
    expect(searchRes.items.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.items[0].title).toContain('Example Opportunity Alpha');

    const cmpRes = await fetch(
      `${baseUrl}/api/opportunities/compare?ids=opp_test_one,opp_test_two`
    ).then((r) => r.json());
    expect(cmpRes.items.length).toBe(2);
  });

  it('allows admin login, role management, and writes audit logs', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@proofpath.ai',
        password: 'Admin@2026!',
      }),
    });
    expect(loginRes.status).toBe(200);
    const cookie = extractCookie(loginRes);
    const data = await loginRes.json();
    expect(data.user.role).toBe('admin');

    const httpOpportunity = await fetch(`${baseUrl}/api/admin/opportunities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({
        title: 'Insecure Source Opportunity',
        organization: 'Example Institute',
        country: 'Example Country',
        category: 'scholarship',
        educationLevel: 'masters',
        fundingType: 'fully_funded',
        fundingAmount: 'Varies by program',
        deadline: '2027-06-01',
        officialUrl: 'http://example.org/scholarships',
        description: 'This opportunity has a non-HTTPS official URL.',
      }),
    });
    expect(httpOpportunity.status).toBe(400);

    const createOpportunity = await fetch(`${baseUrl}/api/admin/opportunities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({
        title: 'Review Pending Opportunity',
        organization: 'Example Institute',
        country: 'Example Country',
        category: 'scholarship',
        educationLevel: 'masters',
        fundingType: 'fully_funded',
        fundingAmount: 'Varies by program',
        deadline: '2027-06-01',
        officialUrl: 'https://example.org/scholarships',
        description: 'A new opportunity awaiting source review.',
        verificationStatus: 'VERIFIED',
      }),
    });
    expect(createOpportunity.status).toBe(201);
    const createdOpportunity = await createOpportunity.json();
    const createdRow = db
      .prepare('SELECT verification_status, is_published FROM opportunities WHERE id = ?')
      .get(createdOpportunity.id) as { verification_status: string; is_published: number };
    expect(createdRow.verification_status).toBe('UNVERIFIED');
    expect(createdRow.is_published).toBe(0);
    expect(createdOpportunity.isPublished).toBe(false);

    const publicDraftSearch = await fetch(
      `${baseUrl}/api/opportunities?q=${encodeURIComponent('Review Pending Opportunity')}`
    ).then((response) => response.json());
    expect(publicDraftSearch.items.some((item: { id: string }) => item.id === createdOpportunity.id)).toBe(false);

    const adminOpportunities = await fetch(`${baseUrl}/api/admin/opportunities`, {
      headers: { Cookie: cookie },
    });
    expect(adminOpportunities.status).toBe(200);
    const adminOpportunityItems = await adminOpportunities.json();
    expect(adminOpportunityItems.items.some((item: { id: string; isPublished: boolean }) =>
      item.id === createdOpportunity.id && item.isPublished === false
    )).toBe(true);

    const prematurePublish = await fetch(`${baseUrl}/api/admin/opportunities/${createdOpportunity.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({ isPublished: true, reviewNote: 'Source reviewed but status is not verified.' }),
    });
    expect(prematurePublish.status).toBe(400);

    const markVerified = await fetch(`${baseUrl}/api/admin/opportunities/${createdOpportunity.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({ verificationStatus: 'VERIFIED' }),
    });
    expect(markVerified.status).toBe(200);
    expect((db.prepare('SELECT is_published FROM opportunities WHERE id = ?').get(createdOpportunity.id) as { is_published: number }).is_published).toBe(0);

    const missingReviewNote = await fetch(`${baseUrl}/api/admin/opportunities/${createdOpportunity.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({ isPublished: true }),
    });
    expect(missingReviewNote.status).toBe(400);

    const publishReviewed = await fetch(`${baseUrl}/api/admin/opportunities/${createdOpportunity.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({
        isPublished: true,
        reviewNote: 'Reviewed the official institute scholarship page and confirmed the current deadline.',
      }),
    });
    expect(publishReviewed.status).toBe(200);
    expect((await publishReviewed.json()).isPublished).toBe(true);
    const publishAudit = db.prepare(
      "SELECT action, metadata_json FROM admin_audit_logs WHERE target_id = ? AND action = 'OPPORTUNITY_PUBLISHED' ORDER BY created_at DESC LIMIT 1"
    ).get(createdOpportunity.id) as { action: string; metadata_json: string };
    expect(publishAudit.action).toBe('OPPORTUNITY_PUBLISHED');
    expect(JSON.parse(publishAudit.metadata_json).reviewNote).toContain('official institute scholarship page');
    const publicPublishedSearch = await fetch(
      `${baseUrl}/api/opportunities?q=${encodeURIComponent('Review Pending Opportunity')}`
    ).then((response) => response.json());
    expect(publicPublishedSearch.items.some((item: { id: string }) => item.id === createdOpportunity.id)).toBe(true);

    const downgradeReview = await fetch(`${baseUrl}/api/admin/opportunities/${createdOpportunity.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': data.csrfToken,
      },
      body: JSON.stringify({ verificationStatus: 'SUPPORTED' }),
    });
    expect(downgradeReview.status).toBe(200);
    expect((db.prepare('SELECT is_published FROM opportunities WHERE id = ?').get(createdOpportunity.id) as { is_published: number }).is_published).toBe(0);
    const publicDowngradedSearch = await fetch(
      `${baseUrl}/api/opportunities?q=${encodeURIComponent('Review Pending Opportunity')}`
    ).then((response) => response.json());
    expect(publicDowngradedSearch.items.some((item: { id: string }) => item.id === createdOpportunity.id)).toBe(false);

    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: cookie },
    });
    expect(usersRes.status).toBe(200);
    const usersJson = await usersRes.json();
    expect(usersJson.items.length).toBeGreaterThanOrEqual(3);

    const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Cookie: cookie },
    });
    expect(auditRes.status).toBe(200);
    const auditJson = await auditRes.json();
    expect(auditJson.items.some((a: { action: string }) => a.action === 'LOGIN_SUCCESS')).toBe(true);
  });

  it('blocks SSRF private/loopback/metadata URLs and spoofed file magic bytes', async () => {
    await expect(assertSafePublicUrl('http://127.0.0.1:3000/api/health')).rejects.toThrow();
    await expect(assertSafePublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(assertSafePublicUrl('http://localhost:5432')).rejects.toThrow();
    await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow();

    const apiSsrf = await fetch(`${baseUrl}/api/verify/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://10.0.0.5/internal' }),
    });
    expect(apiSsrf.status).toBe(400);

    // Spoofed PDF check
    const fakePdf = Buffer.from('NOT_A_PDF_SCRIPT');
    expect(validateMagicBytes(fakePdf, 'application/pdf')).toBe(false);
    const realPdf = Buffer.from('%PDF-1.7\n');
    expect(validateMagicBytes(realPdf, 'application/pdf')).toBe(true);
  });

  it('evaluates eligibility accurately without assuming missing fields', () => {
    const opp = db
      .prepare('SELECT * FROM opportunities WHERE id = ?')
      .get('opp_test_one') as Record<string, unknown>;

    const mappedOpp = {
      id: String(opp.id),
      slug: String(opp.slug),
      title: String(opp.title),
      organization: String(opp.organization),
      country: String(opp.country),
      category: 'scholarship' as const,
      educationLevel: 'phd' as const,
      fundingType: 'fully_funded' as const,
      fundingAmount: String(opp.funding_amount),
      minGpa: 3.7,
      englishReq: 'IELTS 7.5',
      eligibleNationalities: ['All'],
      minAge: null,
      maxAge: null,
      deadline: '2027-01-05',
      officialUrl: String(opp.official_url),
      description: String(opp.description),
      requirements: [],
      verificationStatus: 'VERIFIED' as const,
      lastVerifiedAt: String(opp.last_verified_at),
      isPublished: true,
      createdAt: String(opp.created_at),
      updatedAt: String(opp.updated_at),
    };

    const missingResult = evaluateEligibility(
      {
        userId: 'u1',
        nationality: '',
        countryOfResidence: '',
        age: null,
        educationLevel: '',
        gpa: null,
        gpaScale: 4.0,
        englishProficiency: '',
        englishScore: '',
        financialNeed: 'any',
        academicInterests: [],
        targetCountries: [],
        updatedAt: '',
      },
      mappedOpp
    );
    expect(missingResult.status).toBe('MISSING_INFO');

    const eligibleResult = evaluateEligibility(
      {
        userId: 'u1',
        nationality: 'Bangladesh',
        countryOfResidence: 'Bangladesh',
        age: 24,
        educationLevel: 'phd',
        gpa: 3.9,
        gpaScale: 4.0,
        englishProficiency: 'IELTS',
        englishScore: '8.0',
        financialNeed: 'full_funding',
        academicInterests: ['CS'],
        targetCountries: ['United Kingdom'],
        updatedAt: '',
      },
      mappedOpp
    );
    expect(eligibleResult.status).toBe('ELIGIBLE');
  });

  it('returns matchIntelligence, trustProfile, and ProofPath 2.0 student analytics intelligence', async () => {
    const detailRes = await fetch(`${baseUrl}/api/opportunities/opp_test_one`).then((r) => r.json());
    expect(detailRes.opportunity.trustProfile).toBeDefined();
    expect(detailRes.opportunity.trustProfile.officialDomain).toBe('example.org');
    expect(detailRes.opportunity.matchIntelligence).toBeDefined();
    expect(Array.isArray(detailRes.verificationHistory)).toBe(true);

    // Log in as student to verify student analytics intelligence payload
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'student@proofpath.ai',
        password: 'Student@2026!',
      }),
    });
    expect(loginRes.status).toBe(200);
    const cookie = extractCookie(loginRes);

    const analytics = await fetch(`${baseUrl}/api/analytics/student`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json());

    expect(analytics.intelligenceScore.totalScore).toBeGreaterThanOrEqual(0);
    expect(analytics.intelligenceScore.totalScore).toBeLessThanOrEqual(100);
    expect(analytics.intelligenceScore.components).toHaveLength(4);
    expect(analytics.personalRadar).toBeDefined();
    expect(analytics.deadlineIntelligence).toHaveProperty('urgent');
    expect(analytics.deadlineIntelligence).toHaveProperty('upcoming');
    expect(analytics.deadlineIntelligence).toHaveProperty('recentlyExpired');
    expect(Array.isArray(analytics.actionCenter)).toBe(true);
  });

  it('keeps Copilot consent, conversations, and verification context scoped to each authenticated student', async () => {
    const previous = {
      aiEnabled: process.env.AI_ENABLED,
      freeTier: process.env.AI_FREE_TIER_CONFIRMED,
      globalLimit: process.env.AI_GLOBAL_DAILY_LIMIT,
      apiKey: process.env.GEMINI_API_KEY,
    };
    process.env.AI_ENABLED = 'false';
    process.env.AI_FREE_TIER_CONFIRMED = 'false';
    process.env.AI_GLOBAL_DAILY_LIMIT = '0';
    delete process.env.GEMINI_API_KEY;

    const register = async (suffix: string) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: `Copilot ${suffix}`,
          email: `copilot_${suffix}_${Date.now()}@example.edu`,
          password: 'StrongPassword123!',
        }),
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      return { cookie: extractCookie(response), csrfToken: body.csrfToken };
    };

    try {
      const studentA = await register('a');
      const studentB = await register('b');
      const userA = db.prepare("SELECT id FROM users WHERE email LIKE 'copilot_a_%' ORDER BY created_at DESC LIMIT 1")
        .get() as { id: string };
      const report = await runVerificationEngine(db, userA.id, {
        inputType: 'text',
        submittedTitle: 'Private application notice',
        submittedText: 'This private application notice has no independent verification.',
      });
      expect(report.overallStatus).toBe('INSUFFICIENT_EVIDENCE');

      const initialStatus = await fetch(`${baseUrl}/api/assistant/status`, {
        headers: { Cookie: studentA.cookie },
      }).then((response) => response.json());
      expect(initialStatus.consent).toBe(false);
      expect(initialStatus.aiReady).toBe(false);

      const chat = await fetch(`${baseUrl}/api/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: studentA.cookie,
          'X-CSRF-Token': studentA.csrfToken,
        },
        body: JSON.stringify({ message: 'Explain this verification report.', contextReportId: report.id }),
      });
      expect(chat.status).toBe(200);
      const chatData = await chat.json();
      expect(chatData.assistantMessage.responseMode).toBe('guided');
      expect(chatData.assistantMessage.content).toContain('Private application notice');
      expect(chatData.fallbackReason).toBe('consent_required');

      const crossUserMessages = await fetch(
        `${baseUrl}/api/assistant/conversations/${chatData.conversationId}/messages`,
        { headers: { Cookie: studentB.cookie } }
      );
      expect(crossUserMessages.status).toBe(404);

      const crossUserReport = await fetch(`${baseUrl}/api/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: studentB.cookie,
          'X-CSRF-Token': studentB.csrfToken,
        },
        body: JSON.stringify({ message: 'Explain this report.', contextReportId: report.id }),
      });
      expect(crossUserReport.status).toBe(404);

      const consent = await fetch(`${baseUrl}/api/assistant/consent`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: studentA.cookie,
          'X-CSRF-Token': studentA.csrfToken,
        },
        body: JSON.stringify({ enabled: true }),
      });
      expect(consent.status).toBe(200);
      const updatedStatus = await fetch(`${baseUrl}/api/assistant/status`, {
        headers: { Cookie: studentA.cookie },
      }).then((response) => response.json());
      expect(updatedStatus.consent).toBe(true);

      const clear = await fetch(`${baseUrl}/api/assistant/conversations`, {
        method: 'DELETE',
        headers: { Cookie: studentA.cookie, 'X-CSRF-Token': studentA.csrfToken },
      });
      expect(clear.status).toBe(200);
      expect((await clear.json()).deleted).toBeGreaterThanOrEqual(1);
    } finally {
      if (previous.aiEnabled === undefined) delete process.env.AI_ENABLED;
      else process.env.AI_ENABLED = previous.aiEnabled;
      if (previous.freeTier === undefined) delete process.env.AI_FREE_TIER_CONFIRMED;
      else process.env.AI_FREE_TIER_CONFIRMED = previous.freeTier;
      if (previous.globalLimit === undefined) delete process.env.AI_GLOBAL_DAILY_LIMIT;
      else process.env.AI_GLOBAL_DAILY_LIMIT = previous.globalLimit;
      if (previous.apiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.apiKey;
    }
  });

  it('enforces a read-only public demo at the API boundary', async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      dbPath: process.env.DB_PATH,
      sessionSecret: process.env.SESSION_SECRET,
      demoMode: process.env.DEMO_MODE,
    };
    const demoDbPath = path.join(tempDir, 'public-demo-readonly.db');
    let demoDb: Database.Database | undefined;
    let demoServer: http.Server | undefined;
    try {
      process.env.NODE_ENV = 'production';
      process.env.DB_PATH = demoDbPath;
      process.env.SESSION_SECRET = 'public-demo-test-secret-that-is-not-a-real-credential';
      delete process.env.DEMO_MODE;
      demoDb = initDatabase();
      const demoApp = createApp(demoDb);
      await new Promise<void>((resolve) => {
        demoServer = demoApp.listen(0, '127.0.0.1', () => resolve());
      });
      if (!demoServer) throw new Error('Demo test server did not start.');

const address = demoServer.address();
      if (!address || typeof address === 'string') throw new Error('Demo test server did not bind.');
      const demoBaseUrl = `http://127.0.0.1:${address.port}`;

      const beforeUsers = (demoDb.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
      const registration = await fetch(`${demoBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Public Demo User',
          email: 'public-demo-user@example.test',
          password: 'NotARealPassword123!',
        }),
      });
      expect(registration.status).toBe(403);
      expect(await registration.json()).toMatchObject({ code: 'DEMO_READ_ONLY' });

      const upload = await fetch(`${demoBaseUrl}/api/verify/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(upload.status).toBe(403);

      const writeAttempts = await Promise.all([
        fetch(`${demoBaseUrl}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }),
        fetch(`${demoBaseUrl}/api/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }),
        fetch(`${demoBaseUrl}/api/saved/demo-opportunity`, { method: 'DELETE' }),
      ]);
      expect(writeAttempts.map((response) => response.status)).toEqual([403, 403, 403]);
      expect((demoDb.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count).toBe(beforeUsers);

      const health = await fetch(`${demoBaseUrl}/api/health`).then((response) => response.json());
      expect(health).toMatchObject({ status: 'ok', demoMode: true });
      const catalogue = await fetch(`${demoBaseUrl}/api/opportunities`).then((response) => response.json());
      expect(catalogue.items).toEqual([]);
    } finally {
      if (demoServer) await new Promise<void>((resolve) => demoServer!.close(() => resolve()));
      demoDb?.close();
      for (const [key, value] of Object.entries({
        NODE_ENV: previous.nodeEnv,
        DB_PATH: previous.dbPath,
        SESSION_SECRET: previous.sessionSecret,
        DEMO_MODE: previous.demoMode,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('blocks demo evaluation account login when NODE_ENV is production', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const blockedRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@proofpath.ai',
          password: 'Admin@2026!',
        }),
      });
      expect(blockedRes.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
