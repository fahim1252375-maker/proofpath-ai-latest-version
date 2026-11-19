import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  createNotification,
  mapOpportunityRow,
  mapProfileRow,
  mapUserRow,
  writeAuditLog,
} from './db.ts';
import {
  createRateLimiter,
  generateToken,
  hashPassword,
  hashToken,
  sanitizeText,
  timingSafeEqualString,
  validateMagicBytes,
  verifyPassword,
} from './security.ts';
import { assertSafePublicUrl, fetchPublicUrlSnippet, UnsafePublicUrlError } from './ssrf.ts';
import {
  buildTrustProfile,
  computeMatchIntelligence,
  computeOpportunityIntelligenceScore,
  evaluateEligibility,
} from './eligibility.ts';
import { AiServiceError, runAssistantChat, runVerificationEngine } from './ai.ts';
import { getAssistantProviderStatus } from './assistant-providers.ts';
import { AI_CONSENT_VERSION, getAiRuntimeConfig, getAiUsageForToday } from './ai-policy.ts';
import { registerIntelligenceRoutes } from './intelligence.ts';
import { scoreSourceCredibility } from './source-credibility.ts';
import type { SafeUser, StudentProfile, UserRecord, UserRole, VerificationReportDTO } from './types.ts';

/**
 * Whether a user-triggered in-app notification of this type should be created.
 * Reads the user's notification_preferences row; a missing row means enabled.
 * Deadline inserts are gated by the deadline sweep's own in_app_deadlines
 * check and monitoring inserts by watchlist_preferences — not by this helper.
 */
const NOTIFICATION_PREF_COLUMN: Record<'verification' | 'application' | 'security', string> = {
  verification: 'in_app_verifications',
  application: 'in_app_applications',
  security: 'in_app_security',
};

function shouldNotify(
  db: Database.Database,
  userId: string,
  type: 'verification' | 'application' | 'security'
): boolean {
  const column = NOTIFICATION_PREF_COLUMN[type];
  const row = db
    .prepare(`SELECT ${column} AS enabled FROM notification_preferences WHERE user_id = ?`)
    .get(userId) as { enabled: number } | undefined;
  return !row || Number(row.enabled) === 1;
}

const SESSION_COOKIE_NAME = 'proofpath_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthedRequest extends Request {
  authUser?: SafeUser;
  csrfToken?: string;
  sessionId?: string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
    files: 1,
  },
});

const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function hydrateReportRow(db: Database.Database, row: Record<string, unknown>): VerificationReportDTO {
  const extractedInfo = JSON.parse(String(row.extracted_info_json || '{}'));
  const linkedOpportunity = row.opportunity_id
    ? db.prepare('SELECT official_url FROM opportunities WHERE id = ?').get(String(row.opportunity_id)) as { official_url: string } | undefined
    : undefined;
  const officialUrl = linkedOpportunity?.official_url || '';
  const evidenceRows = db
    .prepare(
      'SELECT claim_index, source_url, source_title, excerpt, stance, retrieved_at FROM evidence_records WHERE report_id = ? ORDER BY claim_index ASC'
    )
    .all(String(row.id)) as Array<Record<string, unknown>>;

  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
    inputType: row.input_type as VerificationReportDTO['inputType'],
    submittedUrl: row.submitted_url ? String(row.submitted_url) : null,
    submittedTitle: row.submitted_title ? String(row.submitted_title) : null,
    fileName: row.file_name ? String(row.file_name) : null,
    overallStatus: row.overall_status as VerificationReportDTO['overallStatus'],
    summary: String(row.summary),
    extractedInfo,
    claims: JSON.parse(String(row.claims_json || '[]')),
    evidenceSources: evidenceRows.map((e) => ({
      claimIndex: Number(e.claim_index || 0),
      sourceUrl: String(e.source_url),
      sourceTitle: String(e.source_title),
      excerpt: String(e.excerpt),
      stance: e.stance as 'supports' | 'contradicts' | 'neutral',
      retrievedAt: String(e.retrieved_at),
      credibility: scoreSourceCredibility(String(e.source_url), officialUrl),
    })),
    riskIndicators: JSON.parse(String(row.risk_indicators_json || '[]')),
    confidenceLimitations: String(row.confidence_limitations || ''),
    recommendedActions: JSON.parse(String(row.recommended_actions_json || '[]')),
    isSaved: Number(row.is_saved) === 1,
    createdAt: String(row.created_at),
  };
}

export function createApp(db: Database.Database) {
  const app = express();
  const demoFlag = process.env.DEMO_MODE?.trim().toLowerCase();
  // Production is read-only by default. An operator must explicitly opt out
  // with DEMO_MODE=false when deploying a separately reviewed writable system.
  const publicDemoMode = demoFlag === 'true' || (process.env.NODE_ENV === 'production' && demoFlag !== 'false');
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; upgrade-insecure-requests"
      );
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Request logging for API routes
  app.use('/api', (req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(JSON.stringify({
          level: 'info',
          event: 'http_request',
          method: req.method,
          route: req.route?.path || 'unmatched',
          status: res.statusCode,
          durationMs: Date.now() - started,
        }));
      }
    });
    next();
  });

  // In public demo mode, reject every state-changing API method before route handlers,
  // including registration, uploads, verification submissions, assistant writes and admin actions.
  app.use('/api', (req, res, next) => {
    if (!publicDemoMode || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({
      error: 'This public ProofPath demo is read-only. Account creation, uploads, submissions and changes are disabled.',
      code: 'DEMO_READ_ONLY',
    });
  });

  // Demo mode intentionally skips cookie/session lookup to keep GET requests side-effect free.
  // In other environments, attach the authenticated user from the HTTP-only session cookie.
  app.use((req: AuthedRequest, _res, next) => {
    if (publicDemoMode) return next();
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken || typeof rawToken !== 'string') {
      return next();
    }
    const tokenHash = hashToken(rawToken);
    const sessionRow = db
      .prepare(
        `SELECT s.id as session_id, s.csrf_token, s.expires_at, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as (UserRecord & { session_id: string; csrf_token: string; expires_at: string }) | undefined;

    if (!sessionRow) return next();
    if (new Date(sessionRow.expires_at).getTime() < Date.now() || sessionRow.is_active !== 1) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionRow.session_id);
      return next();
    }

    req.authUser = mapUserRow(sessionRow);
    req.csrfToken = sessionRow.csrf_token;
    req.sessionId = sessionRow.session_id;
    next();
  });

  // CSRF check for authenticated state-changing API requests (skip login/register/public endpoints)
  const CSRF_EXEMPT_PATHS = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/contact',
    '/api/verify/url',
    '/api/verify/text',
    '/api/verify/file',
    '/api/community-reports',
  ]);

  app.use('/api', (req: AuthedRequest, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.authUser) return next();
    if (CSRF_EXEMPT_PATHS.has(req.path) || CSRF_EXEMPT_PATHS.has(req.originalUrl.split('?')[0])) {
      return next();
    }
    const headerToken = req.headers['x-csrf-token'];
    if (
      typeof headerToken !== 'string' ||
      typeof req.csrfToken !== 'string' ||
      !timingSafeEqualString(headerToken, req.csrfToken)
    ) {
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return;
    }
    next();
  });

  function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    next();
  }

  function requireRole(...roles: UserRole[]) {
    return (req: AuthedRequest, res: Response, next: NextFunction) => {
      if (!req.authUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (!roles.includes(req.authUser.role)) {
        res.status(403).json({ error: 'Insufficient permissions for this resource.' });
        return;
      }
      next();
    };
  }

  const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30, keyPrefix: 'auth' });
  const aiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 15, keyPrefix: 'ai' });

  function setSessionCookie(res: Response, rawToken: string) {
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
  }

  function createSessionForUser(req: Request, res: Response, userId: string): string {
    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, csrf_token, ip_address, user_agent, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `ses_${crypto.randomUUID()}`,
      userId,
      hashToken(rawToken),
      csrfToken,
      req.ip || null,
      String(req.headers['user-agent'] || '').slice(0, 250),
      expiresAt,
      now.toISOString()
    );
    setSessionCookie(res, rawToken);
    return csrfToken;
  }

  function getStudentProfile(userId: string): StudentProfile | null {
    const row = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    return mapProfileRow(row);
  }

  // ==================== HEALTH & PUBLIC ENDPOINTS ====================
  app.get('/api/health', (_req, res) => {
    try {
      const dbOk = db.prepare('SELECT 1 as ok').get() as { ok: number };
      const migration = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null };
      const aiConfig = getAiRuntimeConfig();
      res.json({
        status: 'ok',
        database: dbOk.ok === 1 ? 'connected' : 'error',
        schemaVersion: migration.version || 0,
        aiEnabled: aiConfig.ready,
        demoMode: publicDemoMode,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        error: 'Health check failed',
      });
    }
  });

  app.get('/api/docs', (_req, res) => {
    res.json({
      name: 'ProofPath AI Enterprise API',
      version: '1.0.0',
      endpoints: [
        'GET /api/health',
        'GET /api/public/stats',
        'POST /api/auth/register | /login | /logout | /forgot-password | /reset-password',
        'GET /api/auth/me',
        'GET/PUT /api/profile',
        'GET /api/opportunities | /api/opportunities/compare | /api/opportunities/:id',
        'POST /api/verify/url | /api/verify/text | /api/verify/file',
        'GET /api/verifications | /api/verifications/:id',
        'GET/POST/PATCH/DELETE /api/applications',
        'GET/POST /api/assistant/conversations | /api/assistant/chat',
        'GET/PATCH /api/notifications',
        'POST /api/community-reports',
        'GET/POST/PATCH/DELETE /api/admin/*',
      ],
    });
  });

  app.get('/api/public/stats', (_req, res) => {
    const verifiedOpportunities = (
      db
        .prepare("SELECT COUNT(*) as c FROM opportunities WHERE is_published = 1 AND verification_status = 'VERIFIED'")
        .get() as { c: number }
    ).c;
    const totalOpportunities = (
      db.prepare('SELECT COUNT(*) as c FROM opportunities WHERE is_published = 1').get() as { c: number }
    ).c;
    // Public stats may only count anonymous reports, never owner-scoped ones.
    const verificationReports = (
      db
        .prepare(
          process.env.NODE_ENV === 'production'
            ? "SELECT COUNT(*) as c FROM verification_reports WHERE user_id IS NULL AND id <> 'rep_seed_chevening'"
            : "SELECT COUNT(*) as c FROM verification_reports WHERE user_id IS NULL OR id = 'rep_seed_chevening'"
        )
        .get() as { c: number }
    ).c;
    const countriesCovered = (
      db.prepare('SELECT COUNT(DISTINCT country) as c FROM opportunities WHERE is_published = 1').get() as {
        c: number;
      }
    ).c;
    const communityReports = (
      db.prepare('SELECT COUNT(*) as c FROM community_reports').get() as { c: number }
    ).c;
    const contentRow = db
      .prepare("SELECT value_json FROM site_content WHERE key = 'landing_announcement'")
      .get() as { value_json: string } | undefined;

    res.json({
      verifiedOpportunities,
      totalOpportunities,
      verificationReports,
      countriesCovered,
      communityReports,
      announcement: contentRow ? JSON.parse(contentRow.value_json) : null,
    });
  });

  app.post('/api/contact', authLimiter, (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(120),
      email: z.string().email().max(180),
      subject: z.string().min(3).max(160),
      message: z.string().min(10).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid contact form data.', details: parsed.error.flatten() });
      return;
    }
    const id = `msg_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO contact_messages (id, name, email, subject, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'new', ?)
    `).run(
      id,
      sanitizeText(parsed.data.name, 120),
      parsed.data.email.trim().toLowerCase(),
      sanitizeText(parsed.data.subject, 160),
      sanitizeText(parsed.data.message, 3000),
      new Date().toISOString()
    );
    res.status(201).json({ id, message: 'Message received. Our team will review your inquiry.' });
  });

  // ==================== AUTHENTICATION ====================
  app.post('/api/auth/register', authLimiter, (req, res) => {
    const schema = z.object({
      fullName: z.string().min(2).max(120),
      email: z.string().email().max(180),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128),
      preferredLanguage: z.enum(['en', 'bn']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration input.' });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(parsed.data.password);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, is_active, preferred_language, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'student', 1, ?, ?, ?)
      `).run(
        userId,
        email,
        passwordHash,
        sanitizeText(parsed.data.fullName, 120),
        parsed.data.preferredLanguage || 'en',
        now,
        now
      );

      db.prepare(`
        INSERT INTO student_profiles (user_id, updated_at) VALUES (?, ?)
      `).run(userId, now);

      db.prepare(`
        INSERT INTO notification_preferences (user_id, updated_at) VALUES (?, ?)
      `).run(userId, now);
    })();

    if (shouldNotify(db, userId, 'security')) {
      createNotification(db, {
        userId,
        type: 'security',
        title: 'Account Created',
        message: 'Complete your Student Eligibility Profile to unlock personalized opportunity matching.',
        link: '/dashboard/eligibility',
      });
    }

    writeAuditLog(db, {
      actorUserId: userId,
      action: 'USER_REGISTERED',
      targetType: 'user',
      targetId: userId,
      ipAddress: req.ip,
    });

    const csrfToken = createSessionForUser(req, res, userId);
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRecord;
    res.status(201).json({
      user: mapUserRow(userRow),
      csrfToken,
    });
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;

    if (!userRow || !verifyPassword(parsed.data.password, userRow.password_hash)) {
      writeAuditLog(db, {
        actorUserId: userRow?.id || null,
        action: 'LOGIN_FAILED',
        targetType: 'auth',
        targetId: email,
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (userRow.is_active !== 1) {
      res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
      return;
    }

    if (
      process.env.NODE_ENV === 'production' &&
      ['usr_student_demo', 'usr_mod_demo', 'usr_admin_demo'].includes(userRow.id)
    ) {
      res.status(403).json({ error: 'Evaluation accounts are disabled in production environments.' });
      return;
    }

    const csrfToken = createSessionForUser(req, res, userRow.id);
    writeAuditLog(db, {
      actorUserId: userRow.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'user',
      targetId: userRow.id,
      ipAddress: req.ip,
    });

    res.json({
      user: mapUserRow(userRow),
      csrfToken,
    });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    if (req.sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    if (!req.authUser) {
      res.json({ user: null, csrfToken: null, unreadNotifications: 0, profile: null });
      return;
    }
    const unreadNotifications = (
      db
        .prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
        .get(req.authUser.id) as { c: number }
    ).c;
    const profile = getStudentProfile(req.authUser.id);
    res.json({
      user: req.authUser,
      csrfToken: req.csrfToken,
      unreadNotifications,
      profile,
    });
  });

  app.post('/api/auth/forgot-password', authLimiter, (req, res) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid email address.' });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;

    let resetTokenForNonProd: string | undefined;
    if (userRow) {
      const rawToken = generateToken(24);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(`rst_${crypto.randomUUID()}`, userRow.id, hashToken(rawToken), expiresAt, now.toISOString());

      writeAuditLog(db, {
        actorUserId: userRow.id,
        action: 'PASSWORD_RESET_REQUESTED',
        targetType: 'user',
        targetId: userRow.id,
        ipAddress: req.ip,
      });

      if (process.env.NODE_ENV !== 'production') {
        resetTokenForNonProd = rawToken;
      }
    }

    res.json({
      message:
        'If an account exists for that email, a password reset token was generated. Note: external SMTP email delivery is not configured in this environment.',
      emailProviderConfigured: false,
      ...(resetTokenForNonProd ? { devResetToken: resetTokenForNonProd } : {}),
    });
  });

  app.post('/api/auth/reset-password', authLimiter, (req, res) => {
    const schema = z.object({
      token: z.string().min(10),
      newPassword: z.string().min(8).max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid reset token and password (min 8 characters) are required.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL')
      .get(hashToken(parsed.data.token)) as
      | { id: string; user_id: string; expires_at: string }
      | undefined;

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(parsed.data.newPassword),
        now,
        row.user_id
      );
      db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, row.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    })();

    if (shouldNotify(db, row.user_id, 'security')) {
      createNotification(db, {
        userId: row.user_id,
        type: 'security',
        title: 'Password Updated',
        message: 'Your account password was changed and active sessions were refreshed.',
        link: '/dashboard/eligibility',
      });
    }

    res.json({ message: 'Password updated successfully. You may now sign in.' });
  });

  app.patch('/api/auth/preferences', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      fullName: z.string().min(2).max(120).optional(),
      preferredLanguage: z.enum(['en', 'bn']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update.' });
      return;
    }
    const now = new Date().toISOString();
    if (parsed.data.fullName) {
      db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(
        sanitizeText(parsed.data.fullName, 120),
        now,
        req.authUser!.id
      );
    }
    if (parsed.data.preferredLanguage) {
      db.prepare('UPDATE users SET preferred_language = ?, updated_at = ? WHERE id = ?').run(
        parsed.data.preferredLanguage,
        now,
        req.authUser!.id
      );
    }
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser!.id) as UserRecord;
    res.json({ user: mapUserRow(updated) });
  });

  app.post('/api/auth/change-password', requireAuth, authLimiter, (req: AuthedRequest, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(8).max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters.' });
      return;
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      res.status(400).json({ error: 'Your new password must be different from your current password.' });
      return;
    }
    if (!req.sessionId) {
      res.status(401).json({ error: 'Your session could not be validated. Please sign in again.' });
      return;
    }

    const userRow = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.authUser!.id) as { password_hash: string } | undefined;
    if (!userRow || !verifyPassword(parsed.data.currentPassword, userRow.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const now = new Date().toISOString();
    const revokedOtherSessions = db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(parsed.data.newPassword),
        now,
        req.authUser!.id
      );
      const revoked = db
        .prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')
        .run(req.authUser!.id, req.sessionId!).changes;
      writeAuditLog(db, {
        actorUserId: req.authUser!.id,
        action: 'PASSWORD_CHANGED',
        targetType: 'user',
        targetId: req.authUser!.id,
        ipAddress: req.ip,
        metadata: { revokedOtherSessions: revoked },
      });
      if (shouldNotify(db, req.authUser!.id, 'security')) {
        createNotification(db, {
          userId: req.authUser!.id,
          type: 'security',
          title: 'Password changed',
          message: 'Your password was updated. Other active sessions were signed out.',
          link: '/dashboard/settings',
        });
      }
      return revoked;
    })();

    res.json({
      message: 'Password updated. Other active sessions have been signed out.',
      revokedOtherSessions,
    });
  });

  // ==================== STUDENT PROFILE & ELIGIBILITY ====================
  app.get('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    res.json({ profile: getStudentProfile(req.authUser!.id) });
  });

  app.put('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      nationality: z.string().max(100).default(''),
      countryOfResidence: z.string().max(100).default(''),
      age: z.number().int().min(13).max(99).nullable().default(null),
      educationLevel: z.enum(['', 'high_school', 'undergraduate', 'masters', 'phd', 'all']).default(''),
      gpa: z.number().min(0).max(100).nullable().default(null),
      gpaScale: z.number().min(1).max(100).default(4.0),
      englishProficiency: z.string().max(60).default(''),
      englishScore: z.string().max(30).default(''),
      financialNeed: z.enum(['full_funding', 'partial_funding', 'self_funded', 'any']).default('any'),
      academicInterests: z.array(z.string().max(80)).max(15).default([]),
      targetCountries: z.array(z.string().max(80)).max(15).default([]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid student profile data.', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO student_profiles (
        user_id, nationality, country_of_residence, age, education_level, gpa, gpa_scale,
        english_proficiency, english_score, financial_need, academic_interests_json, target_countries_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        nationality = excluded.nationality,
        country_of_residence = excluded.country_of_residence,
        age = excluded.age,
        education_level = excluded.education_level,
        gpa = excluded.gpa,
        gpa_scale = excluded.gpa_scale,
        english_proficiency = excluded.english_proficiency,
        english_score = excluded.english_score,
        financial_need = excluded.financial_need,
        academic_interests_json = excluded.academic_interests_json,
        target_countries_json = excluded.target_countries_json,
        updated_at = excluded.updated_at
    `).run(
      req.authUser!.id,
      sanitizeText(d.nationality, 100),
      sanitizeText(d.countryOfResidence, 100),
      d.age,
      d.educationLevel,
      d.gpa,
      d.gpaScale,
      sanitizeText(d.englishProficiency, 60),
      sanitizeText(d.englishScore, 30),
      d.financialNeed,
      JSON.stringify(d.academicInterests),
      JSON.stringify(d.targetCountries),
      now
    );

    res.json({ profile: getStudentProfile(req.authUser!.id) });
  });

  // ==================== OPPORTUNITIES DISCOVERY & COMPARISON ====================
  app.get('/api/opportunities', (req: AuthedRequest, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || 'all');
    const country = String(req.query.country || 'all');
    const educationLevel = String(req.query.educationLevel || 'all');
    const fundingType = String(req.query.fundingType || 'all');
    const status = String(req.query.status || 'all');
    const maxGpaParam = req.query.maxGpa ? Number(req.query.maxGpa) : null;
    const deadlineBefore = String(req.query.deadlineBefore || '').trim();
    const sort = String(req.query.sort || 'deadline_asc');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));

    const where: string[] = ['is_published = 1'];
    const params: unknown[] = [];

    if (q) {
      where.push('(LOWER(title) LIKE ? OR LOWER(organization) LIKE ? OR LOWER(description) LIKE ? OR LOWER(country) LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category && category !== 'all') {
      where.push('category = ?');
      params.push(category);
    }
    if (country && country !== 'all') {
      where.push('country = ?');
      params.push(country);
    }
    if (educationLevel && educationLevel !== 'all') {
      where.push("(education_level = ? OR education_level = 'all')");
      params.push(educationLevel);
    }
    if (fundingType && fundingType !== 'all') {
      where.push('funding_type = ?');
      params.push(fundingType);
    }
    if (status && status !== 'all') {
      where.push('verification_status = ?');
      params.push(status);
    }
    if (maxGpaParam !== null && !Number.isNaN(maxGpaParam)) {
      where.push('(min_gpa IS NULL OR min_gpa <= ?)');
      params.push(maxGpaParam);
    }
    if (deadlineBefore) {
      where.push('deadline <= ?');
      params.push(deadlineBefore);
    }

    const orderBy =
      sort === 'deadline_desc'
        ? 'deadline DESC'
        : sort === 'verified_recent'
        ? 'last_verified_at DESC'
        : sort === 'title_asc'
        ? 'title ASC'
        : 'deadline ASC';

    const whereSql = where.join(' AND ');
    const total = (
      db.prepare(`SELECT COUNT(*) as c FROM opportunities WHERE ${whereSql}`).get(...params) as {
        c: number;
      }
    ).c;

    const offset = (page - 1) * limit;
    const rows = db
      .prepare(`SELECT * FROM opportunities WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    const profile = req.authUser ? getStudentProfile(req.authUser.id) : null;
    const savedSet = new Set<string>(
      req.authUser
        ? (
            db
              .prepare('SELECT opportunity_id FROM saved_opportunities WHERE user_id = ?')
              .all(req.authUser.id) as Array<{ opportunity_id: string }>
          ).map((s) => s.opportunity_id)
        : []
    );

    const items = rows.map((row) => {
      const opp = mapOpportunityRow(row);
      const eligibility = profile ? evaluateEligibility(profile, opp) : null;
      return {
        ...opp,
        isSaved: savedSet.has(opp.id),
        eligibility,
        matchIntelligence: computeMatchIntelligence(profile, opp, eligibility),
      };
    });

    const countries = (
      db.prepare('SELECT DISTINCT country FROM opportunities WHERE is_published = 1 ORDER BY country ASC').all() as Array<{
        country: string;
      }>
    ).map((c) => c.country);

    res.json({
      items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      facets: { countries },
    });
  });

  app.get('/api/opportunities/compare', (req: AuthedRequest, res) => {
    const idsParam = String(req.query.ids || '');
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);

    if (!ids.length) {
      res.json({ items: [] });
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM opportunities WHERE id IN (${placeholders}) AND is_published = 1`)
      .all(...ids) as Array<Record<string, unknown>>;

    const profile = req.authUser ? getStudentProfile(req.authUser.id) : null;
    const items = rows.map((r) => {
      const opp = mapOpportunityRow(r);
      const eligibility = profile ? evaluateEligibility(profile, opp) : null;
      return {
        ...opp,
        eligibility,
        matchIntelligence: computeMatchIntelligence(profile, opp, eligibility),
      };
    });

    res.json({ items });
  });

  app.get('/api/opportunities/:id', (req: AuthedRequest, res) => {
    const row = db
      .prepare('SELECT * FROM opportunities WHERE (id = ? OR slug = ?) AND is_published = 1')
      .get(req.params.id, req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Opportunity not found.' });
      return;
    }

    const opp = mapOpportunityRow(row);
    const profile = req.authUser ? getStudentProfile(req.authUser.id) : null;
    const isSaved = req.authUser
      ? Boolean(
          db
            .prepare('SELECT 1 FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?')
            .get(req.authUser.id, opp.id)
        )
      : false;

    const relatedReports = db
      .prepare('SELECT * FROM verification_reports WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 5')
      .all(opp.id) as Array<Record<string, unknown>>;

    const reportCount = (
      db.prepare('SELECT COUNT(*) as c FROM verification_reports WHERE opportunity_id = ?').get(opp.id) as {
        c: number;
      }
    ).c;
    const evidenceCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM evidence_records e
           JOIN verification_reports r ON r.id = e.report_id
           WHERE r.opportunity_id = ?`
        )
        .get(opp.id) as { c: number }
    ).c;
    const flagCount = (
      db.prepare('SELECT COUNT(*) as c FROM community_reports WHERE opportunity_id = ?').get(opp.id) as {
        c: number;
      }
    ).c;

    const eligibility = profile ? evaluateEligibility(profile, opp) : null;

    res.json({
      opportunity: {
        ...opp,
        isSaved,
        eligibility,
        matchIntelligence: computeMatchIntelligence(profile, opp, eligibility),
        trustProfile: buildTrustProfile(opp, { reportCount, evidenceCount, flagCount }),
      },
      verificationHistory: relatedReports.map((r) => hydrateReportRow(db, r)),
    });
  });

  app.get('/api/saved', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT o.* FROM saved_opportunities s
         JOIN opportunities o ON o.id = s.opportunity_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC`
      )
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    const profile = getStudentProfile(req.authUser!.id);
    res.json({
      items: rows.map((r) => {
        const opp = mapOpportunityRow(r);
        const eligibility = profile ? evaluateEligibility(profile, opp) : null;
        return {
          ...opp,
          isSaved: true,
          eligibility,
          matchIntelligence: computeMatchIntelligence(profile, opp, eligibility),
        };
      }),
    });
  });

  app.post('/api/saved/:opportunityId', requireAuth, (req: AuthedRequest, res) => {
    const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(req.params.opportunityId);
    if (!opp) {
      res.status(404).json({ error: 'Opportunity not found.' });
      return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO saved_opportunities (id, user_id, opportunity_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(`sav_${crypto.randomUUID()}`, req.authUser!.id, req.params.opportunityId, new Date().toISOString());
    res.status(201).json({ saved: true });
  });

  app.delete('/api/saved/:opportunityId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?').run(
      req.authUser!.id,
      req.params.opportunityId
    );
    res.json({ saved: false });
  });

  // ==================== AI OPPORTUNITY VERIFICATION ENGINE ====================
  app.post('/api/verify/url', aiLimiter, async (req: AuthedRequest, res) => {
    const schema = z.object({
      url: z.string().min(8).max(1000),
      title: z.string().max(200).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid HTTP/HTTPS opportunity URL.' });
      return;
    }

    let safeUrl: URL;
    try {
      safeUrl = await assertSafePublicUrl(parsed.data.url);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Blocked or invalid URL.' });
      return;
    }

    try {
      const fetchedPage = await fetchPublicUrlSnippet(safeUrl);
      const linkedOpportunity = db
        .prepare(
          `SELECT id FROM opportunities
           WHERE is_published = 1
             AND lower(rtrim(official_url, '/')) = lower(rtrim(?, '/'))
           LIMIT 1`
        )
        .get(safeUrl.toString()) as { id: string } | undefined;

      const report = await runVerificationEngine(db, req.authUser?.id || null, {
        inputType: 'url',
        opportunityId: linkedOpportunity?.id || null,
        submittedUrl: safeUrl.toString(),
        submittedTitle: parsed.data.title ? sanitizeText(parsed.data.title, 200) : fetchedPage.pageTitle || undefined,
        fetchedPage,
      });

      if (req.authUser && shouldNotify(db, req.authUser.id, 'verification')) {
        createNotification(db, {
          userId: req.authUser.id,
          type: 'verification',
          title: `Local review: ${report.overallStatus}`,
          message: 'Page reachability and basic text cues were checked. Independent source confirmation is unavailable in no-cost mode.',
          link: `/verify?report=${report.id}`,
        });
      }

      res.status(201).json({ report });
    } catch (err) {
      if (err instanceof AiServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof UnsafePublicUrlError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Unexpected error while verifying URL.' });
    }
  });

  app.post('/api/verify/text', aiLimiter, async (req: AuthedRequest, res) => {
    const schema = z.object({
      title: z.string().max(200).optional(),
      text: z.string().min(20, 'Paste at least 20 characters of announcement text.').max(15000),
      referenceUrl: z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid announcement text.' });
      return;
    }

    let safeRefUrl: string | undefined;
    if (parsed.data.referenceUrl?.trim()) {
      try {
        safeRefUrl = (await assertSafePublicUrl(parsed.data.referenceUrl)).toString();
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid reference URL.' });
        return;
      }
    }

    try {
      const report = await runVerificationEngine(db, req.authUser?.id || null, {
        inputType: 'text',
        submittedTitle: parsed.data.title ? sanitizeText(parsed.data.title, 200) : undefined,
        submittedText: sanitizeText(parsed.data.text, 15000),
        submittedUrl: safeRefUrl,
      });

      if (req.authUser && shouldNotify(db, req.authUser.id, 'verification')) {
        createNotification(db, {
          userId: req.authUser.id,
          type: 'verification',
          title: `Local text review: ${report.overallStatus}`,
          message: 'Basic wording cues were checked. Independent source confirmation is unavailable in no-cost mode.',
          link: `/verify?report=${report.id}`,
        });
      }

      res.status(201).json({ report });
    } catch (err) {
      if (err instanceof AiServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Unexpected error while verifying text.' });
    }
  });

  app.post(
    '/api/verify/file',
    aiLimiter,
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : 'File upload error (max 10MB).' });
          return;
        }
        next();
      });
    },
    async (req: AuthedRequest, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Please attach a PDF document, poster image, or screenshot.' });
        return;
      }
      if (!ALLOWED_UPLOAD_MIMES.has(req.file.mimetype)) {
        res.status(400).json({ error: 'Unsupported file type. Upload PDF, PNG, JPEG, or WEBP.' });
        return;
      }
      if (!validateMagicBytes(req.file.buffer, req.file.mimetype)) {
        res.status(400).json({ error: 'File signature does not match declared file type.' });
        return;
      }

      try {
        const report = await runVerificationEngine(db, req.authUser?.id || null, {
          inputType: 'file',
          fileBuffer: req.file.buffer,
          fileName: sanitizeText(req.file.originalname, 180),
          fileMime: req.file.mimetype,
          submittedTitle: req.body?.title ? sanitizeText(String(req.body.title), 200) : undefined,
          submittedText: req.body?.notes ? sanitizeText(String(req.body.notes), 2000) : undefined,
        });

        if (req.authUser && shouldNotify(db, req.authUser.id, 'verification')) {
          createNotification(db, {
            userId: req.authUser.id,
            type: 'verification',
            title: `Document check: ${report.overallStatus}`,
            message: 'File type was checked. Document contents were not extracted or stored in no-cost mode.',
            link: `/verify?report=${report.id}`,
          });
        }

        res.status(201).json({ report });
      } catch (err) {
        if (err instanceof AiServiceError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Unable to process the uploaded file.' });
      }
    }
  );

  app.get('/api/verifications', (req: AuthedRequest, res) => {
    const scope = String(req.query.scope || 'mine');
    if (scope === 'public' || !req.authUser) {
      // Reports are private by default. There is no explicit public-sharing
      // consent field, so never expose anonymous or owner-scoped reports here.
      res.json({ items: [] });
      return;
    }

    const rows = db
      .prepare('SELECT * FROM verification_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(req.authUser.id) as Array<Record<string, unknown>>;
    res.json({ items: rows.map((r) => hydrateReportRow(db, r)) });
  });

  app.get('/api/verifications/:id', (req: AuthedRequest, res) => {
    const row = db
      .prepare('SELECT * FROM verification_reports WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Verification report not found.' });
      return;
    }
    // The showcase report id is restricted to staff roles in every environment.
    if (row.id === 'rep_seed_chevening' && req.authUser?.role !== 'admin' && req.authUser?.role !== 'moderator') {
      res.status(404).json({ error: 'Verification report not found.' });
      return;
    }
    if (
      row.user_id &&
      req.authUser?.id !== row.user_id &&
      req.authUser?.role !== 'admin' &&
      req.authUser?.role !== 'moderator'
    ) {
      // Allow reading seeded public showcase reports or own reports
      if (row.id !== 'rep_seed_chevening') {
        res.status(403).json({ error: 'You do not have permission to view this private verification report.' });
        return;
      }
    }
    res.json({ report: hydrateReportRow(db, row) });
  });

  app.patch('/api/verifications/:id/save', requireAuth, (req: AuthedRequest, res) => {
    const row = db
      .prepare('SELECT id, user_id, is_saved FROM verification_reports WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null; is_saved: number } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    if (row.user_id && row.user_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Cannot modify another user’s report.' });
      return;
    }
    const nextSaved = row.is_saved === 1 ? 0 : 1;
    db.prepare('UPDATE verification_reports SET is_saved = ?, user_id = COALESCE(user_id, ?) WHERE id = ?').run(
      nextSaved,
      req.authUser!.id,
      row.id
    );
    res.json({ isSaved: nextSaved === 1 });
  });

  // ==================== APPLICATION MANAGEMENT SYSTEM ====================
  app.get('/api/applications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY deadline ASC, updated_at DESC')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    const docRows = db
      .prepare('SELECT * FROM application_documents WHERE user_id = ? ORDER BY updated_at DESC')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    const docsByApp = new Map<string, Array<Record<string, unknown>>>();
    for (const d of docRows) {
      const appId = String(d.application_id);
      const list = docsByApp.get(appId) || [];
      list.push({
        id: String(d.id),
        applicationId: appId,
        docName: String(d.doc_name),
        docType: String(d.doc_type),
        isReady: Number(d.is_ready) === 1,
        notes: String(d.notes || ''),
        updatedAt: String(d.updated_at),
      });
      docsByApp.set(appId, list);
    }

    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        opportunityId: r.opportunity_id ? String(r.opportunity_id) : null,
        customTitle: String(r.custom_title),
        organization: String(r.organization),
        status: String(r.status),
        deadline: String(r.deadline),
        notes: String(r.notes || ''),
        checklist: JSON.parse(String(r.checklist_json || '[]')),
        activity: JSON.parse(String(r.activity_json || '[]')),
        priority: String(r.priority || 'medium'),
        documents: docsByApp.get(String(r.id)) || [],
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
    });
  });

  app.post('/api/applications', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      opportunityId: z.string().nullable().optional(),
      customTitle: z.string().min(2).max(200),
      organization: z.string().min(2).max(160),
      status: z.enum(['researching', 'preparing', 'submitted', 'interview', 'accepted', 'rejected']).default('researching'),
      deadline: z.string().min(4).max(40),
      priority: z.enum(['high', 'medium', 'low']).default('medium'),
      notes: z.string().max(4000).default(''),
      checklist: z
        .array(
          z.object({
            id: z.string(),
            label: z.string().max(200),
            done: z.boolean(),
          })
        )
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid application details.', details: parsed.error.flatten() });
      return;
    }

    const id = `app_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const defaultChecklist = parsed.data.checklist || [
      { id: crypto.randomUUID(), label: 'Verify official application portal domain', done: false },
      { id: crypto.randomUUID(), label: 'Prepare academic transcripts & CV', done: false },
      { id: crypto.randomUUID(), label: 'Request recommendation letters', done: false },
      { id: crypto.randomUUID(), label: 'Draft statement of purpose', done: false },
    ];
    const activity = [{ timestamp: now, action: `Created in ${parsed.data.status} stage` }];

    db.prepare(`
      INSERT INTO applications (
        id, user_id, opportunity_id, custom_title, organization, status, deadline, notes, checklist_json, activity_json, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.authUser!.id,
      parsed.data.opportunityId || null,
      sanitizeText(parsed.data.customTitle, 200),
      sanitizeText(parsed.data.organization, 160),
      parsed.data.status,
      sanitizeText(parsed.data.deadline, 40),
      sanitizeText(parsed.data.notes, 4000),
      JSON.stringify(defaultChecklist),
      JSON.stringify(activity),
      parsed.data.priority,
      now,
      now
    );

    if (shouldNotify(db, req.authUser!.id, 'application')) {
      createNotification(db, {
        userId: req.authUser!.id,
        type: 'application',
        title: 'Application Added',
        message: `${parsed.data.customTitle} added to your tracker (Deadline: ${parsed.data.deadline}).`,
        link: '/dashboard/applications',
      });
    }

    res.status(201).json({ id });
  });

  app.patch('/api/applications/:id', requireAuth, (req: AuthedRequest, res) => {
    const existing = db
      .prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.authUser!.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    const schema = z.object({
      status: z.enum(['researching', 'preparing', 'submitted', 'interview', 'accepted', 'rejected']).optional(),
      deadline: z.string().min(4).max(40).optional(),
      priority: z.enum(['high', 'medium', 'low']).optional(),
      notes: z.string().max(4000).optional(),
      checklist: z
        .array(z.object({ id: z.string(), label: z.string().max(200), done: z.boolean() }))
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update payload.' });
      return;
    }

    const now = new Date().toISOString();
    const activity = JSON.parse(String(existing.activity_json || '[]')) as Array<{
      timestamp: string;
      action: string;
    }>;

    if (parsed.data.status && parsed.data.status !== existing.status) {
      activity.unshift({
        timestamp: now,
        action: `Moved from ${existing.status} to ${parsed.data.status}`,
      });
      if (shouldNotify(db, req.authUser!.id, 'application')) {
        createNotification(db, {
          userId: req.authUser!.id,
          type: 'application',
          title: 'Application Status Updated',
          message: `${existing.custom_title} moved to ${parsed.data.status}.`,
          link: '/dashboard/applications',
        });
      }
    } else if (parsed.data.checklist) {
      const done = parsed.data.checklist.filter((c) => c.done).length;
      activity.unshift({
        timestamp: now,
        action: `Updated checklist (${done}/${parsed.data.checklist.length} completed)`,
      });
    }

    db.prepare(`
      UPDATE applications SET
        status = ?,
        deadline = ?,
        priority = ?,
        notes = ?,
        checklist_json = ?,
        activity_json = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      parsed.data.status ?? existing.status,
      parsed.data.deadline ?? existing.deadline,
      parsed.data.priority ?? existing.priority,
      parsed.data.notes !== undefined ? sanitizeText(parsed.data.notes, 4000) : existing.notes,
      parsed.data.checklist ? JSON.stringify(parsed.data.checklist) : existing.checklist_json,
      JSON.stringify(activity.slice(0, 30)),
      now,
      req.params.id,
      req.authUser!.id
    );

    res.json({ ok: true });
  });

  app.delete('/api/applications/:id', requireAuth, (req: AuthedRequest, res) => {
    const info = db
      .prepare('DELETE FROM applications WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.authUser!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/applications/:id/documents', requireAuth, (req: AuthedRequest, res) => {
    const appRow = db
      .prepare('SELECT id FROM applications WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.authUser!.id);
    if (!appRow) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    const schema = z.object({
      docName: z.string().min(2).max(160),
      docType: z.string().max(60).default('document'),
      isReady: z.boolean().default(false),
      notes: z.string().max(500).default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid document entry.' });
      return;
    }
    const id = `doc_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO application_documents (id, application_id, user_id, doc_name, doc_type, is_ready, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.params.id,
      req.authUser!.id,
      sanitizeText(parsed.data.docName, 160),
      sanitizeText(parsed.data.docType, 60),
      parsed.data.isReady ? 1 : 0,
      sanitizeText(parsed.data.notes, 500),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  app.patch('/api/applications/:id/documents/:docId', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      isReady: z.boolean().optional(),
      notes: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid document update.' });
      return;
    }
    const existing = db
      .prepare('SELECT * FROM application_documents WHERE id = ? AND application_id = ? AND user_id = ?')
      .get(req.params.docId, req.params.id, req.authUser!.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    db.prepare('UPDATE application_documents SET is_ready = ?, notes = ?, updated_at = ? WHERE id = ?').run(
      parsed.data.isReady !== undefined ? (parsed.data.isReady ? 1 : 0) : existing.is_ready,
      parsed.data.notes !== undefined ? sanitizeText(parsed.data.notes, 500) : existing.notes,
      new Date().toISOString(),
      req.params.docId
    );
    res.json({ ok: true });
  });

  app.delete('/api/applications/:id/documents/:docId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM application_documents WHERE id = ? AND application_id = ? AND user_id = ?').run(
      req.params.docId,
      req.params.id,
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  // ==================== AI ASSISTANT (ENGLISH & BANGLA) ====================
  app.get('/api/assistant/status', requireAuth, async (req: AuthedRequest, res) => {
    const config = getAiRuntimeConfig();
    const usage = getAiUsageForToday(db, req.authUser!.id);
    const settings = db.prepare('SELECT external_ai_consent, consent_version, consent_updated_at FROM ai_user_settings WHERE user_id = ?')
      .get(req.authUser!.id) as { external_ai_consent: number; consent_version: string | null; consent_updated_at: string | null } | undefined;
    const consent = settings?.external_ai_consent === 1 && settings.consent_version === AI_CONSENT_VERSION;
    let availability = 'ready';
    if (!consent) availability = 'consent_required';
    else if (!config.enabled) availability = 'disabled';
    else if (!config.freeTierConfirmed) availability = 'free_tier_unconfirmed';
    else if (!config.studentAudienceApproved) availability = 'student_audience_unapproved';
    else if (!config.modelAllowed) availability = 'model_unavailable';
    else if (!config.apiKeyConfigured) availability = 'api_key_missing';
    else if (config.globalDailyLimit < 1) availability = 'global_limit_unconfigured';
    else if (usage.usedToday >= config.userDailyLimit) availability = 'user_limit';
    else if (usage.globalUsedToday >= config.globalDailyLimit) availability = 'global_limit';

    const localProviders = await getAssistantProviderStatus();
    res.json({
      availability,
      aiReady: config.ready,
      consent,
      consentUpdatedAt: settings?.consent_updated_at || null,
      model: config.modelAllowed ? config.model : null,
      usedToday: usage.usedToday,
      dailyLimit: config.userDailyLimit,
      remainingToday: Math.max(0, config.userDailyLimit - usage.usedToday),
      resetAt: usage.resetAt,
      localProviders,
    });
  });

  app.put('/api/assistant/consent', requireAuth, (req: AuthedRequest, res) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose whether to allow Gemini processing.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_user_settings (user_id, external_ai_consent, consent_version, consent_updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        external_ai_consent = excluded.external_ai_consent,
        consent_version = excluded.consent_version,
        consent_updated_at = excluded.consent_updated_at
    `).run(
      req.authUser!.id,
      parsed.data.enabled ? 1 : 0,
      parsed.data.enabled ? AI_CONSENT_VERSION : null,
      now
    );
    res.json({ consent: parsed.data.enabled, updatedAt: now });
  });

  app.get('/api/assistant/conversations', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        language: r.language as 'en' | 'bn',
        contextOpportunityId: r.context_opportunity_id ? String(r.context_opportunity_id) : null,
        contextReportId: r.context_report_id ? String(r.context_report_id) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
    });
  });

  app.post('/api/assistant/conversations', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      title: z.string().min(1).max(160).default('New Advising Session'),
      language: z.enum(['en', 'bn']).default('en'),
      contextOpportunityId: z.string().nullable().optional(),
      contextReportId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid conversation input.' });
      return;
    }
    if (parsed.data.contextOpportunityId) {
      const opportunity = db.prepare('SELECT id FROM opportunities WHERE id = ? AND is_published = 1')
        .get(parsed.data.contextOpportunityId);
      if (!opportunity) {
        res.status(404).json({ error: 'Published opportunity not found.' });
        return;
      }
    }
    if (parsed.data.contextReportId) {
      const report = db.prepare('SELECT id FROM verification_reports WHERE id = ? AND user_id = ?')
        .get(parsed.data.contextReportId, req.authUser!.id);
      if (!report) {
        res.status(404).json({ error: 'Verification report not found.' });
        return;
      }
    }
    const id = `conv_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO conversations (id, user_id, title, language, context_opportunity_id, context_report_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.authUser!.id,
      sanitizeText(parsed.data.title, 160),
      parsed.data.language,
      parsed.data.contextOpportunityId || null,
      parsed.data.contextReportId || null,
      now,
      now
    );
    res.status(201).json({ id, title: parsed.data.title, language: parsed.data.language });
  });

  app.get('/api/assistant/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const conv = db
      .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.authUser!.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const msgs = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as Array<Record<string, unknown>>;
    res.json({
      items: msgs.map((m) => ({
        id: String(m.id),
        role: m.role as 'user' | 'assistant',
        content: String(m.content),
        groundingRefs: JSON.parse(String(m.grounding_refs_json || '[]')),
        responseMode: m.response_mode === 'gemini' ? 'gemini' : 'guided',
        createdAt: String(m.created_at),
      })),
    });
  });

  app.delete('/api/assistant/conversations', requireAuth, (req: AuthedRequest, res) => {
    const result = db.prepare('DELETE FROM conversations WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true, deleted: result.changes });
  });

  app.delete('/api/assistant/conversations/:id', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
    res.json({ ok: true });
  });

  app.post('/api/assistant/chat', requireAuth, aiLimiter, async (req: AuthedRequest, res) => {
    const schema = z.object({
      conversationId: z.string().optional(),
      message: z.string().min(1).max(4000),
      language: z.enum(['en', 'bn']).default('en'),
      contextOpportunityId: z.string().nullable().optional(),
      contextReportId: z.string().nullable().optional(),
      provider: z.enum(['auto', 'guided', 'ollama', 'openjarvis', 'gemini']).default('gemini'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Message text is required.' });
      return;
    }

    const userId = req.authUser!.id;
    let conversationId = parsed.data.conversationId;
    let storedContext: { context_opportunity_id: string | null; context_report_id: string | null } | undefined;
    if (conversationId) {
      storedContext = db.prepare(`
        SELECT context_opportunity_id, context_report_id FROM conversations WHERE id = ? AND user_id = ?
      `).get(conversationId, userId) as typeof storedContext;
      if (!storedContext) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
    }

    const contextOpportunityId = parsed.data.contextOpportunityId || storedContext?.context_opportunity_id || null;
    const contextReportId = parsed.data.contextReportId || storedContext?.context_report_id || null;
    if (contextOpportunityId) {
      const opportunity = db.prepare('SELECT id FROM opportunities WHERE id = ? AND is_published = 1')
        .get(contextOpportunityId);
      if (!opportunity) {
        res.status(404).json({ error: 'Published opportunity not found.' });
        return;
      }
    }
    if (contextReportId) {
      const report = db.prepare('SELECT id FROM verification_reports WHERE id = ? AND user_id = ?')
        .get(contextReportId, userId);
      if (!report) {
        res.status(404).json({ error: 'Verification report not found.' });
        return;
      }
    }

    const now = new Date().toISOString();
    if (!conversationId) {
      conversationId = `conv_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO conversations (id, user_id, title, language, context_opportunity_id, context_report_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        conversationId,
        userId,
        sanitizeText(parsed.data.message, 60),
        parsed.data.language,
        contextOpportunityId,
        contextReportId,
        now,
        now
      );
    }

    const userMsgId = `msg_${crypto.randomUUID()}`;
    const cleanMsg = sanitizeText(parsed.data.message, 4000);
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, grounding_refs_json, created_at)
      VALUES (?, ?, 'user', ?, '[]', ?)
    `).run(userMsgId, conversationId, cleanMsg, now);

    try {
      const settings = db.prepare('SELECT external_ai_consent, consent_version FROM ai_user_settings WHERE user_id = ?')
        .get(userId) as { external_ai_consent: number; consent_version: string | null } | undefined;
      const externalAiConsent = settings?.external_ai_consent === 1 && settings.consent_version === AI_CONSENT_VERSION;
      const profile = getStudentProfile(userId);
      const generationAbort = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) generationAbort.abort();
      });
      const result = await runAssistantChat(db, {
        userId,
        conversationId,
        userMessage: cleanMsg,
        language: parsed.data.language,
        profile,
        externalAiConsent,
        providerPreference: parsed.data.provider,
        signal: generationAbort.signal,
        contextOpportunityId,
        contextReportId,
      });

      const assistantMsgId = `msg_${crypto.randomUUID()}`;
      const replyTime = new Date().toISOString();
      db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, grounding_refs_json, response_mode, created_at)
        VALUES (?, ?, 'assistant', ?, ?, ?, ?)
      `).run(assistantMsgId, conversationId, result.reply, JSON.stringify(result.groundingRefs), result.responseMode, replyTime);
      db.prepare('UPDATE conversations SET updated_at = ?, language = ? WHERE id = ? AND user_id = ?')
        .run(replyTime, parsed.data.language, conversationId, userId);

      res.json({
        conversationId,
        fallbackReason: result.fallbackReason,
        usage: result.usage,
        userMessage: { id: userMsgId, role: 'user', content: cleanMsg, groundingRefs: [], responseMode: 'guided', createdAt: now },
        assistantMessage: {
          id: assistantMsgId,
          role: 'assistant',
          content: result.reply,
          groundingRefs: result.groundingRefs,
          responseMode: result.responseMode,
          provider: result.provider,
          createdAt: replyTime,
        },
      });
    } catch {
      if (res.destroyed) return;
      res.status(500).json({ error: 'Assistant could not save this response. Please try again.' });
    }
  });

  app.post('/api/assistant/conversations/:id/regenerate', requireAuth, aiLimiter, async (req: AuthedRequest, res) => {
    const parsed = z.object({
      provider: z.enum(['auto', 'guided', 'ollama', 'openjarvis', 'gemini']).default('gemini'),
    }).safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a supported response provider.' });
      return;
    }
    const userId = req.authUser!.id;
    const conversation = db.prepare(`
      SELECT id, language, context_opportunity_id, context_report_id
      FROM conversations WHERE id = ? AND user_id = ?
    `).get(req.params.id, userId) as {
      id: string;
      language: 'en' | 'bn';
      context_opportunity_id: string | null;
      context_report_id: string | null;
    } | undefined;
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const latest = db.prepare(`
      SELECT id, role, content FROM messages
      WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 2
    `).all(req.params.id) as Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
    if (latest.length < 2 || latest[0].role !== 'assistant' || latest[1].role !== 'user') {
      res.status(409).json({ error: 'There is no completed assistant response to regenerate.' });
      return;
    }

    const settings = db.prepare('SELECT external_ai_consent, consent_version FROM ai_user_settings WHERE user_id = ?')
      .get(userId) as { external_ai_consent: number; consent_version: string | null } | undefined;
    const externalAiConsent = settings?.external_ai_consent === 1 && settings.consent_version === AI_CONSENT_VERSION;
    const generationAbort = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) generationAbort.abort();
    });
    try {
      const result = await runAssistantChat(db, {
        userId,
        conversationId: conversation.id,
        userMessage: latest[1].content,
        language: conversation.language,
        profile: getStudentProfile(userId),
        externalAiConsent,
        providerPreference: parsed.data.provider,
        contextOpportunityId: conversation.context_opportunity_id,
        contextReportId: conversation.context_report_id,
        signal: generationAbort.signal,
      });
      const createdAt = new Date().toISOString();
      db.prepare(`
        UPDATE messages SET content = ?, grounding_refs_json = ?, response_mode = ?, created_at = ?
        WHERE id = ? AND conversation_id = ? AND role = 'assistant'
      `).run(
        result.reply,
        JSON.stringify(result.groundingRefs),
        result.responseMode,
        createdAt,
        latest[0].id,
        conversation.id,
      );
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?')
        .run(createdAt, conversation.id, userId);
      res.json({
        fallbackReason: result.fallbackReason,
        usage: result.usage,
        assistantMessage: {
          id: latest[0].id,
          role: 'assistant',
          content: result.reply,
          groundingRefs: result.groundingRefs,
          responseMode: result.responseMode,
          provider: result.provider,
          createdAt,
        },
      });
    } catch {
      if (res.destroyed) return;
      res.status(500).json({ error: 'Assistant could not regenerate this response. Please try again.' });
    }
  });

  // ==================== NOTIFICATIONS ====================
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    // Dynamically check upcoming deadlines against user preferences
    const pref = db
      .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
      .get(req.authUser!.id) as Record<string, unknown> | undefined;
    const daysWindow = pref ? Number(pref.deadline_days_before || 14) : 14;
    const deadlinesEnabled = pref ? Number(pref.in_app_deadlines) === 1 : true;

    if (deadlinesEnabled) {
      const apps = db
        .prepare("SELECT id, custom_title, deadline FROM applications WHERE user_id = ? AND status NOT IN ('submitted', 'accepted', 'rejected')")
        .all(req.authUser!.id) as Array<{ id: string; custom_title: string; deadline: string }>;

      const nowMs = Date.now();
      for (const a of apps) {
        const dlMs = new Date(a.deadline).getTime();
        if (!Number.isNaN(dlMs)) {
          const daysLeft = Math.ceil((dlMs - nowMs) / (1000 * 60 * 60 * 24));
          if (daysLeft >= 0 && daysLeft <= daysWindow) {
            const title = `Deadline in ${daysLeft}d: ${a.custom_title}`;
            const exists = db
              .prepare('SELECT 1 FROM notifications WHERE user_id = ? AND title = ?')
              .get(req.authUser!.id, title);
            if (!exists) {
              createNotification(db, {
                userId: req.authUser!.id,
                type: 'deadline',
                title,
                message: `Your tracked application closes on ${a.deadline}. Review your document checklist.`,
                link: '/dashboard/applications',
              });
            }
          }
        }
      }
    }

    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        type: String(r.type),
        title: String(r.title),
        message: String(r.message),
        link: String(r.link),
        isRead: Number(r.is_read) === 1,
        createdAt: String(r.created_at),
      })),
    });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
      req.params.id,
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  app.get('/api/notifications/preferences', requireAuth, (req: AuthedRequest, res) => {
    const row = db
      .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
      .get(req.authUser!.id) as Record<string, unknown> | undefined;
    res.json({
      preferences: row
        ? {
            inAppDeadlines: Number(row.in_app_deadlines) === 1,
            inAppVerifications: Number(row.in_app_verifications) === 1,
            inAppApplications: Number(row.in_app_applications) === 1,
            inAppSecurity: Number(row.in_app_security) === 1,
            deadlineDaysBefore: Number(row.deadline_days_before),
          }
        : {
            inAppDeadlines: true,
            inAppVerifications: true,
            inAppApplications: true,
            inAppSecurity: true,
            deadlineDaysBefore: 14,
          },
    });
  });

  app.put('/api/notifications/preferences', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      inAppDeadlines: z.boolean(),
      inAppVerifications: z.boolean(),
      inAppApplications: z.boolean(),
      inAppSecurity: z.boolean(),
      deadlineDaysBefore: z.number().int().min(1).max(60),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid notification preferences.' });
      return;
    }
    const d = parsed.data;
    db.prepare(`
      INSERT INTO notification_preferences (
        user_id, in_app_deadlines, in_app_verifications, in_app_applications, in_app_security, deadline_days_before, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        in_app_deadlines = excluded.in_app_deadlines,
        in_app_verifications = excluded.in_app_verifications,
        in_app_applications = excluded.in_app_applications,
        in_app_security = excluded.in_app_security,
        deadline_days_before = excluded.deadline_days_before,
        updated_at = excluded.updated_at
    `).run(
      req.authUser!.id,
      d.inAppDeadlines ? 1 : 0,
      d.inAppVerifications ? 1 : 0,
      d.inAppApplications ? 1 : 0,
      d.inAppSecurity ? 1 : 0,
      d.deadlineDaysBefore,
      new Date().toISOString()
    );
    res.json({ preferences: d });
  });

  // ==================== COMMUNITY REPORTS ====================
  app.post('/api/community-reports', authLimiter, (req: AuthedRequest, res) => {
    const schema = z.object({
      opportunityId: z.string().nullable().optional(),
      submittedUrl: z.string().min(5).max(1000),
      reason: z.enum(['scam_fee', 'phishing', 'expired', 'misleading_terms', 'other']),
      details: z.string().min(10).max(2000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide URL, reason, and at least 10 characters of detail.' });
      return;
    }
    const id = `crep_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO community_reports (id, user_id, opportunity_id, submitted_url, reason, details, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      req.authUser?.id || null,
      parsed.data.opportunityId || null,
      sanitizeText(parsed.data.submittedUrl, 1000),
      parsed.data.reason,
      sanitizeText(parsed.data.details, 2000),
      now,
      now
    );

    res.status(201).json({ id, message: 'Report submitted to Trust & Safety moderation queue.' });
  });

  app.get('/api/community-reports/mine', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM community_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({ items: rows });
  });

  // ==================== STUDENT DASHBOARD ANALYTICS ====================
  app.get('/api/analytics/student', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.authUser!.id;
    const profile = getStudentProfile(userId);

    const savedCount = (
      db.prepare('SELECT COUNT(*) as c FROM saved_opportunities WHERE user_id = ?').get(userId) as { c: number }
    ).c;

    const verifiedOppsCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM opportunities WHERE is_published = 1 AND verification_status = 'VERIFIED'")
        .get() as { c: number }
    ).c;

    const myReports = db
      .prepare('SELECT overall_status, created_at FROM verification_reports WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{ overall_status: string; created_at: string }>;

    const apps = db
      .prepare('SELECT id, custom_title, organization, status, deadline, checklist_json FROM applications WHERE user_id = ? ORDER BY deadline ASC')
      .all(userId) as Array<Record<string, unknown>>;

    const statusCounts: Record<string, number> = {
      researching: 0,
      preparing: 0,
      submitted: 0,
      interview: 0,
      accepted: 0,
      rejected: 0,
    };
    for (const a of apps) {
      const s = String(a.status);
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    const allOpps = db
      .prepare('SELECT * FROM opportunities WHERE is_published = 1')
      .all() as Array<Record<string, unknown>>;

    const mappedOpps = allOpps.map(mapOpportunityRow);
    const eligibilityBreakdown = {
      ELIGIBLE: 0,
      POTENTIALLY_ELIGIBLE: 0,
      NOT_ELIGIBLE: 0,
      MISSING_INFO: 0,
    };
    const recommendations: Array<
      ReturnType<typeof mapOpportunityRow> & {
        eligibility: ReturnType<typeof evaluateEligibility>;
        matchIntelligence: ReturnType<typeof computeMatchIntelligence>;
      }
    > = [];

    for (const opp of mappedOpps) {
      const elig = evaluateEligibility(profile, opp);
      eligibilityBreakdown[elig.status]++;
      if (elig.status === 'ELIGIBLE' || elig.status === 'POTENTIALLY_ELIGIBLE') {
        recommendations.push({
          ...opp,
          eligibility: elig,
          matchIntelligence: computeMatchIntelligence(profile, opp, elig),
        });
      }
    }

    const verificationCounts: Record<string, number> = {};
    for (const r of myReports) {
      verificationCounts[r.overall_status] = (verificationCounts[r.overall_status] || 0) + 1;
    }

    const riskAlerts = db
      .prepare(
        `SELECT id, submitted_title, submitted_url, overall_status, created_at
         FROM verification_reports
         WHERE (user_id = ? OR user_id IS NULL) AND overall_status IN ('CONTRADICTED', 'UNVERIFIED')
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(userId) as Array<Record<string, unknown>>;

    const intelligenceScore = computeOpportunityIntelligenceScore(
      profile,
      mappedOpps,
      myReports,
      apps as Array<{ status: string; checklist_json: string }>
    );

    // Deadline Intelligence (urgent <= 14d, upcoming 15-90d, recentlyExpired < 0d)
    const nowMs = Date.now();
    const deadlineSource: Array<{
      id: string;
      title: string;
      organization: string;
      deadline: string;
      source: 'application' | 'opportunity';
      link: string;
      daysLeft: number;
    }> = [];

    for (const a of apps) {
      const ms = new Date(String(a.deadline)).getTime();
      if (!Number.isNaN(ms)) {
        deadlineSource.push({
          id: String(a.id),
          title: String(a.custom_title),
          organization: String(a.organization),
          deadline: String(a.deadline),
          source: 'application',
          link: '/dashboard/applications',
          daysLeft: Math.ceil((ms - nowMs) / (1000 * 60 * 60 * 24)),
        });
      }
    }
    for (const opp of mappedOpps) {
      const ms = new Date(opp.deadline).getTime();
      if (!Number.isNaN(ms)) {
        deadlineSource.push({
          id: opp.id,
          title: opp.title,
          organization: opp.organization,
          deadline: opp.deadline,
          source: 'opportunity',
          link: `/opportunities/${opp.id}`,
          daysLeft: Math.ceil((ms - nowMs) / (1000 * 60 * 60 * 24)),
        });
      }
    }

    deadlineSource.sort((a, b) => a.daysLeft - b.daysLeft);
    const deadlineIntelligence = {
      urgent: deadlineSource.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 21).slice(0, 5),
      upcoming: deadlineSource.filter((d) => d.daysLeft > 21).slice(0, 6),
      recentlyExpired: deadlineSource.filter((d) => d.daysLeft < 0).slice(0, 4),
    };

    // Personal Action Center computed from real gaps
    const actionCenter: Array<{ id: string; title: string; detail: string; link: string; priority: 'high' | 'medium' }> = [];
    if (!profile || !profile.nationality || !profile.gpa || !profile.educationLevel) {
      actionCenter.push({
        id: 'act_profile',
        title: 'Complete Academic & Eligibility Profile',
        detail: 'Enter missing nationality, GPA, or English test details so Opportunity Match Intelligence evaluates all programs.',
        link: '/dashboard/eligibility',
        priority: 'high',
      });
    }
    for (const a of apps) {
      try {
        const list = JSON.parse(String(a.checklist_json || '[]')) as Array<{ done: boolean }>;
        const pending = list.filter((c) => !c.done).length;
        if (pending > 0 && !['accepted', 'rejected', 'submitted'].includes(String(a.status))) {
          actionCenter.push({
            id: `act_app_${String(a.id)}`,
            title: `Finish ${pending} readiness item(s) for ${String(a.custom_title)}`,
            detail: `Current stage: ${String(a.status)} · Deadline ${String(a.deadline)}`,
            link: '/dashboard/applications',
            priority: 'high',
          });
        }
      } catch {
        // skip
      }
    }
    if (myReports.length === 0) {
      actionCenter.push({
        id: 'act_verify',
        title: 'Run your first URL or PDF review',
        detail: 'Check page reachability and basic text cues. New no-cost reviews do not retrieve independent sources or verify claims.',
        link: '/verify',
        priority: 'medium',
      });
    }
    if (recommendations.length > 0) {
      actionCenter.push({
        id: 'act_discover',
        title: `Review ${recommendations.length} eligible or near-match opportunities`,
        detail: 'Compare funding, GPA cutoffs, and deadlines side-by-side.',
        link: '/opportunities',
        priority: 'medium',
      });
    }

    res.json({
      kpis: {
        verifiedOpportunities: verifiedOppsCount,
        savedOpportunities: savedCount,
        activeApplications: apps.filter((a) => !['accepted', 'rejected'].includes(String(a.status))).length,
        totalReportsRun: myReports.length,
      },
      intelligenceScore,
      personalRadar: {
        educationLevel: profile?.educationLevel || '',
        gpa: profile?.gpa ?? null,
        gpaScale: profile?.gpaScale ?? 4.0,
        financialNeed: profile?.financialNeed || 'any',
        targetCountries: profile?.targetCountries || [],
        academicInterests: profile?.academicInterests || [],
        matchedCount: recommendations.length,
      },
      deadlineIntelligence,
      actionCenter: actionCenter.slice(0, 5),
      applicationPipeline: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      eligibilityDistribution: Object.entries(eligibilityBreakdown).map(([status, count]) => ({ status, count })),
      verificationDistribution: Object.entries(verificationCounts).map(([status, count]) => ({ status, count })),
      upcomingDeadlines: apps.slice(0, 5).map((a) => ({
        id: String(a.id),
        title: String(a.custom_title),
        organization: String(a.organization),
        status: String(a.status),
        deadline: String(a.deadline),
      })),
      recommendations: recommendations.slice(0, 4),
      riskAlerts,
    });
  });

  // ==================== ADMIN & MODERATION CONSOLE ====================
  app.get('/api/admin/overview', requireRole('admin', 'moderator'), (_req, res) => {
    const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const totalOpps = (db.prepare('SELECT COUNT(*) as c FROM opportunities').get() as { c: number }).c;
    const totalVerifications = (db.prepare('SELECT COUNT(*) as c FROM verification_reports').get() as { c: number }).c;
    const pendingModReports = (
      db.prepare("SELECT COUNT(*) as c FROM community_reports WHERE status IN ('pending', 'reviewing')").get() as {
        c: number;
      }
    ).c;

    const verificationsByStatus = db
      .prepare('SELECT overall_status as status, COUNT(*) as count FROM verification_reports GROUP BY overall_status')
      .all() as Array<{ status: string; count: number }>;

    const aiStats = db
      .prepare(
        `SELECT feature, status, COUNT(*) as count, ROUND(AVG(latency_ms)) as avg_latency_ms
         FROM ai_usage_logs GROUP BY feature, status`
      )
      .all() as Array<Record<string, unknown>>;

    const opportunityCategories = db
      .prepare('SELECT category, COUNT(*) as count FROM opportunities GROUP BY category')
      .all() as Array<{ category: string; count: number }>;

    const recentAudit = db
      .prepare(
        `SELECT a.*, u.email as actor_email
         FROM admin_audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC LIMIT 15`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      stats: {
        totalUsers,
        totalOpportunities: totalOpps,
        totalVerifications,
        pendingModReports,
        geminiConfigured:
          Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      },
      verificationsByStatus,
      aiStats,
      opportunityCategories,
      recentAudit,
    });
  });

  app.get('/api/admin/users', requireRole('admin'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRecord[];
    res.json({ items: rows.map(mapUserRow) });
  });

  app.patch('/api/admin/users/:id', requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      role: z.enum(['student', 'moderator', 'admin']).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid user update payload.' });
      return;
    }
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as UserRecord | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.id === req.authUser!.id && parsed.data.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET role = ?, is_active = ?, updated_at = ? WHERE id = ?').run(
      parsed.data.role ?? target.role,
      parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : target.is_active,
      now,
      target.id
    );

    writeAuditLog(db, {
      actorUserId: req.authUser!.id,
      action: 'ADMIN_USER_UPDATED',
      targetType: 'user',
      targetId: target.id,
      ipAddress: req.ip,
      metadata: parsed.data,
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id) as UserRecord;
    res.json({ user: mapUserRow(updated) });
  });

  app.get('/api/admin/opportunities', requireRole('admin', 'moderator'), (_req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM opportunities ORDER BY created_at DESC LIMIT 200')
      .all() as Array<Record<string, unknown>>;
    res.json({ items: rows.map(mapOpportunityRow) });
  });

  app.post('/api/admin/opportunities', requireRole('admin', 'moderator'), (req: AuthedRequest, res) => {
    const schema = z.object({
      title: z.string().min(3).max(200),
      organization: z.string().min(2).max(160),
      country: z.string().min(2).max(100),
      category: z.enum(['scholarship', 'internship', 'competition', 'fellowship', 'grant']),
      educationLevel: z.enum(['high_school', 'undergraduate', 'masters', 'phd', 'all']),
      fundingType: z.enum(['fully_funded', 'partially_funded', 'paid_stipend', 'prize_pool', 'unfunded']),
      fundingAmount: z.string().min(2).max(160),
      minGpa: z.number().min(0).max(4).nullable().optional(),
      englishReq: z.string().max(200).default(''),
      eligibleNationalities: z.array(z.string()).default(['All']),
      deadline: z.string().min(4).max(40),
      officialUrl: z.string().url().refine((value) => {
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      }, 'Official opportunity URLs must use HTTPS.'),
      description: z.string().min(10).max(4000),
      requirements: z.array(z.string()).default([]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid opportunity fields.', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    const id = `opp_${crypto.randomUUID()}`;
    const slug = `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-${id.slice(4, 10)}`;
    const now = new Date().toISOString();
    const initialVerificationStatus = 'UNVERIFIED' as const;

    db.prepare(`
      INSERT INTO opportunities (
        id, slug, title, organization, country, category, education_level, funding_type, funding_amount,
        min_gpa, english_req, eligible_nationalities_json, deadline, official_url, description, requirements_json,
        verification_status, last_verified_at, is_published, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      slug,
      sanitizeText(d.title, 200),
      sanitizeText(d.organization, 160),
      sanitizeText(d.country, 100),
      d.category,
      d.educationLevel,
      d.fundingType,
      sanitizeText(d.fundingAmount, 160),
      d.minGpa ?? null,
      sanitizeText(d.englishReq, 200),
      JSON.stringify(d.eligibleNationalities),
      d.deadline,
      d.officialUrl,
      sanitizeText(d.description, 4000),
      JSON.stringify(d.requirements),
      initialVerificationStatus,
      now,
      req.authUser!.id,
      now,
      now
    );

    writeAuditLog(db, {
      actorUserId: req.authUser!.id,
      action: 'OPPORTUNITY_DRAFT_CREATED',
      targetType: 'opportunity',
      targetId: id,
      ipAddress: req.ip,
      metadata: { verificationStatus: initialVerificationStatus, isPublished: false },
    });

    res.status(201).json({ id, slug, verificationStatus: initialVerificationStatus, isPublished: false });
  });

  app.patch('/api/admin/opportunities/:id', requireRole('admin', 'moderator'), (req: AuthedRequest, res) => {
    const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Opportunity not found.' });
      return;
    }

    const schema = z.object({
      verificationStatus: z
        .enum(['VERIFIED', 'SUPPORTED', 'CONTRADICTED', 'UNVERIFIED', 'INSUFFICIENT_EVIDENCE', 'EXPIRED'])
        .optional(),
      isPublished: z.boolean().optional(),
      deadline: z.string().optional(),
      fundingAmount: z.string().optional(),
      reviewNote: z.string().trim().min(10).max(500).optional(),
    }).superRefine((value, context) => {
      if (value.isPublished === true && !value.reviewNote) {
        context.addIssue({
          code: 'custom',
          path: ['reviewNote'],
          message: 'A review note of at least 10 characters is required to publish an opportunity.',
        });
      }
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid opportunity update.' });
      return;
    }

    const nextVerificationStatus = parsed.data.verificationStatus ?? existing.verification_status;
    const requestedPublishState = parsed.data.isPublished;
    const currentlyPublished = Number(existing.is_published) === 1;
    const newlyApprovedAsVerified = parsed.data.verificationStatus === 'VERIFIED' && existing.verification_status !== 'VERIFIED';
    const nextPublishState = requestedPublishState ?? (newlyApprovedAsVerified ? false : currentlyPublished);

    if (requestedPublishState === true && nextVerificationStatus !== 'VERIFIED') {
      res.status(400).json({
        error: 'Only opportunities marked VERIFIED after an official-source review can be published.',
      });
      return;
    }

    // A record must not remain publicly visible after its review status is
    // downgraded, contradicted, expired, or otherwise no longer VERIFIED.
    const safePublishState = nextVerificationStatus === 'VERIFIED' && nextPublishState;
    const now = new Date().toISOString();
    const nextLastVerifiedAt = parsed.data.verificationStatus !== undefined
      ? now
      : existing.last_verified_at;
    db.prepare(`
      UPDATE opportunities SET
        verification_status = ?,
        is_published = ?,
        deadline = ?,
        funding_amount = ?,
        last_verified_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      nextVerificationStatus,
      safePublishState ? 1 : 0,
      parsed.data.deadline ?? existing.deadline,
      parsed.data.fundingAmount ?? existing.funding_amount,
      nextLastVerifiedAt,
      now,
      req.params.id
    );

    writeAuditLog(db, {
      actorUserId: req.authUser!.id,
      action: requestedPublishState === true && safePublishState
        ? 'OPPORTUNITY_PUBLISHED'
        : requestedPublishState === false && currentlyPublished
          ? 'OPPORTUNITY_UNPUBLISHED'
          : 'OPPORTUNITY_UPDATED',
      targetType: 'opportunity',
      targetId: req.params.id,
      ipAddress: req.ip,
      metadata: {
        ...parsed.data,
        reviewNote: parsed.data.isPublished === true ? parsed.data.reviewNote : undefined,
        isPublished: Boolean(safePublishState),
      },
    });

    res.json({ ok: true, verificationStatus: nextVerificationStatus, isPublished: Boolean(safePublishState) });
  });

  app.delete('/api/admin/opportunities/:id', requireRole('admin'), (req: AuthedRequest, res) => {
    const info = db.prepare('DELETE FROM opportunities WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Opportunity not found.' });
      return;
    }
    writeAuditLog(db, {
      actorUserId: req.authUser!.id,
      action: 'OPPORTUNITY_DELETED',
      targetType: 'opportunity',
      targetId: req.params.id,
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/community-reports', requireRole('admin', 'moderator'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT cr.*, u.email as reporter_email
         FROM community_reports cr
         LEFT JOIN users u ON u.id = cr.user_id
         ORDER BY cr.created_at DESC LIMIT 100`
      )
      .all();
    res.json({ items: rows });
  });

  app.patch('/api/admin/community-reports/:id', requireRole('admin', 'moderator'), (req: AuthedRequest, res) => {
    const schema = z.object({
      status: z.enum(['pending', 'reviewing', 'resolved_valid', 'dismissed']),
      resolutionNotes: z.string().max(1000).default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid moderation update.' });
      return;
    }

    const report = db
      .prepare('SELECT * FROM community_reports WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!report) {
      res.status(404).json({ error: 'Community report not found.' });
      return;
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        UPDATE community_reports SET status = ?, reviewed_by = ?, resolution_notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        parsed.data.status,
        req.authUser!.id,
        sanitizeText(parsed.data.resolutionNotes, 1000),
        now,
        req.params.id
      );

      db.prepare(`
        INSERT INTO moderation_logs (id, moderator_id, community_report_id, action, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `mod_${crypto.randomUUID()}`,
        req.authUser!.id,
        req.params.id,
        `STATUS_${parsed.data.status.toUpperCase()}`,
        sanitizeText(parsed.data.resolutionNotes, 1000),
        now
      );
    })();

    if (report.user_id) {
      createNotification(db, {
        userId: String(report.user_id),
        type: 'moderation',
        title: 'Community Report Reviewed',
        message: `Your safety report status was updated to ${parsed.data.status.replace('_', ' ')}.`,
        link: '/dashboard',
      });
    }

    writeAuditLog(db, {
      actorUserId: req.authUser!.id,
      action: 'MODERATION_ACTION',
      targetType: 'community_report',
      targetId: req.params.id,
      ipAddress: req.ip,
      metadata: parsed.data,
    });

    res.json({ ok: true });
  });

  app.get('/api/admin/verifications', requireRole('admin', 'moderator'), (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM verification_reports ORDER BY created_at DESC LIMIT 50')
      .all() as Array<Record<string, unknown>>;
    res.json({ items: rows.map((r) => hydrateReportRow(db, r)) });
  });

  app.get('/api/admin/audit-logs', requireRole('admin'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT a.*, u.email as actor_email
         FROM admin_audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC LIMIT 100`
      )
      .all();
    res.json({ items: rows });
  });

  app.get('/api/admin/ai-usage', requireRole('admin', 'moderator'), (_req, res) => {
    const rows = db
      .prepare(`
        SELECT id, user_id, feature, model, status, latency_ms, tokens_estimated,
               CASE WHEN error_message IS NULL THEN NULL ELSE 'provider_error' END AS error_message,
               created_at
        FROM ai_usage_logs ORDER BY created_at DESC LIMIT 100
      `)
      .all();
    res.json({ items: rows });
  });

  app.get('/api/admin/contact-messages', requireRole('admin', 'moderator'), (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 50')
      .all();
    res.json({ items: rows });
  });

  app.get('/api/admin/content', requireRole('admin'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM site_content').all() as Array<{
      key: string;
      value_json: string;
      updated_at: string;
    }>;
    res.json({
      items: rows.map((r) => ({ key: r.key, value: JSON.parse(r.value_json), updatedAt: r.updated_at })),
    });
  });

  app.put('/api/admin/content/:key', requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      headline: z.string().min(5).max(240),
      subheadline: z.string().min(10).max(600),
      trustBanner: z.string().min(5).max(300),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid content payload.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO site_content (key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).run(req.params.key, JSON.stringify(parsed.data), req.authUser!.id, now);

    writeAuditLog(db, {
      actorUserId: req.authUser!.id,
      action: 'SITE_CONTENT_UPDATED',
      targetType: 'site_content',
      targetId: req.params.key,
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  registerIntelligenceRoutes(app, db, requireAuth, requireRole);

  // Centralized error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  });

  return app;
}
