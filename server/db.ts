import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertProductionDatabasePath, hashPassword } from './security.ts';
import type { OpportunityRecord, SafeUser, StudentProfile, UserRecord } from './types.ts';

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export function initDatabase(customPath?: string): Database.Database {
  const dbPath = process.env.NODE_ENV === 'production'
    ? assertProductionDatabasePath()
    : customPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'proofpath.db');

  if (dbPath === ':memory:' && process.env.NODE_ENV === 'production') {
    throw new DatabaseUnavailableError(
      'In-memory database fallback is prohibited in production. Configure DB_PATH to persistent disk storage.'
    );
  }

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  seedInitialData(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version
    )
  );

  if (!applied.has(1)) {
    const migrate1 = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('student', 'moderator', 'admin')) DEFAULT 'student',
          avatar_url TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          preferred_language TEXT NOT NULL CHECK (preferred_language IN ('en', 'bn')) DEFAULT 'en',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          csrf_token TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS password_resets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS student_profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          nationality TEXT NOT NULL DEFAULT '',
          country_of_residence TEXT NOT NULL DEFAULT '',
          age INTEGER,
          education_level TEXT NOT NULL DEFAULT '',
          gpa REAL,
          gpa_scale REAL NOT NULL DEFAULT 4.0,
          english_proficiency TEXT NOT NULL DEFAULT '',
          english_score TEXT NOT NULL DEFAULT '',
          financial_need TEXT NOT NULL DEFAULT 'any',
          academic_interests_json TEXT NOT NULL DEFAULT '[]',
          target_countries_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS opportunities (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          organization TEXT NOT NULL,
          country TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('scholarship', 'internship', 'competition', 'fellowship', 'grant')),
          education_level TEXT NOT NULL CHECK (education_level IN ('high_school', 'undergraduate', 'masters', 'phd', 'all')),
          funding_type TEXT NOT NULL CHECK (funding_type IN ('fully_funded', 'partially_funded', 'paid_stipend', 'prize_pool', 'unfunded')),
          funding_amount TEXT NOT NULL,
          min_gpa REAL,
          english_req TEXT NOT NULL DEFAULT '',
          eligible_nationalities_json TEXT NOT NULL DEFAULT '["All"]',
          min_age INTEGER,
          max_age INTEGER,
          deadline TEXT NOT NULL,
          official_url TEXT NOT NULL,
          description TEXT NOT NULL,
          requirements_json TEXT NOT NULL DEFAULT '[]',
          verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'SUPPORTED', 'CONTRADICTED', 'UNVERIFIED', 'INSUFFICIENT_EVIDENCE', 'EXPIRED')),
          last_verified_at TEXT NOT NULL,
          is_published INTEGER NOT NULL DEFAULT 1,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verification_reports (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
          input_type TEXT NOT NULL CHECK (input_type IN ('url', 'text', 'file')),
          submitted_url TEXT,
          submitted_title TEXT,
          submitted_text TEXT,
          file_name TEXT,
          file_mime TEXT,
          overall_status TEXT NOT NULL CHECK (overall_status IN ('VERIFIED', 'SUPPORTED', 'CONTRADICTED', 'UNVERIFIED', 'INSUFFICIENT_EVIDENCE', 'EXPIRED')),
          summary TEXT NOT NULL,
          extracted_info_json TEXT NOT NULL,
          claims_json TEXT NOT NULL,
          risk_indicators_json TEXT NOT NULL,
          confidence_limitations TEXT NOT NULL,
          recommended_actions_json TEXT NOT NULL,
          is_saved INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS evidence_records (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES verification_reports(id) ON DELETE CASCADE,
          claim_index INTEGER NOT NULL DEFAULT 0,
          source_url TEXT NOT NULL,
          source_title TEXT NOT NULL,
          excerpt TEXT NOT NULL,
          stance TEXT NOT NULL CHECK (stance IN ('supports', 'contradicts', 'neutral')) DEFAULT 'neutral',
          retrieved_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_opportunities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          UNIQUE(user_id, opportunity_id)
        );

        CREATE TABLE IF NOT EXISTS applications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
          custom_title TEXT NOT NULL,
          organization TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('researching', 'preparing', 'submitted', 'interview', 'accepted', 'rejected')) DEFAULT 'researching',
          deadline TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          checklist_json TEXT NOT NULL DEFAULT '[]',
          activity_json TEXT NOT NULL DEFAULT '[]',
          priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS application_documents (
          id TEXT PRIMARY KEY,
          application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          doc_name TEXT NOT NULL,
          doc_type TEXT NOT NULL DEFAULT 'document',
          is_ready INTEGER NOT NULL DEFAULT 0,
          file_path TEXT,
          notes TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('deadline', 'verification', 'application', 'security', 'moderation')),
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          link TEXT NOT NULL DEFAULT '/dashboard',
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notification_preferences (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          in_app_deadlines INTEGER NOT NULL DEFAULT 1,
          in_app_verifications INTEGER NOT NULL DEFAULT 1,
          in_app_applications INTEGER NOT NULL DEFAULT 1,
          in_app_security INTEGER NOT NULL DEFAULT 1,
          deadline_days_before INTEGER NOT NULL DEFAULT 14,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          language TEXT NOT NULL CHECK (language IN ('en', 'bn')) DEFAULT 'en',
          context_opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
          context_report_id TEXT REFERENCES verification_reports(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          grounding_refs_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS community_reports (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
          submitted_url TEXT NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('scam_fee', 'phishing', 'expired', 'misleading_terms', 'other')),
          details TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'reviewing', 'resolved_valid', 'dismissed')) DEFAULT 'pending',
          reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          resolution_notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS moderation_logs (
          id TEXT PRIMARY KEY,
          moderator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          community_report_id TEXT NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          notes TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id TEXT PRIMARY KEY,
          actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          ip_address TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          feature TEXT NOT NULL,
          model TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')),
          latency_ms INTEGER NOT NULL DEFAULT 0,
          tokens_estimated INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contact_messages (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('new', 'reviewed')) DEFAULT 'new',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS site_content (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
        CREATE INDEX IF NOT EXISTS idx_opportunities_country ON opportunities(country);
        CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);
        CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(verification_status);
        CREATE INDEX IF NOT EXISTS idx_reports_user ON verification_reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_reports_created ON verification_reports(created_at);
        CREATE INDEX IF NOT EXISTS idx_evidence_report ON evidence_records(report_id);
        CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_reports(status);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);
      `);

      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        1,
        'initial_enterprise_schema',
        new Date().toISOString()
      );
    });
    migrate1();
  }

  if (!applied.has(2)) {
    const migrate2 = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS watchlist_preferences (
          user_id TEXT NOT NULL,
          opportunity_id TEXT NOT NULL,
          notify_deadlines INTEGER NOT NULL DEFAULT 1,
          notify_changes INTEGER NOT NULL DEFAULT 1,
          deadline_days_before INTEGER NOT NULL DEFAULT 14 CHECK (deadline_days_before BETWEEN 1 AND 60),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, opportunity_id),
          FOREIGN KEY (user_id, opportunity_id)
            REFERENCES saved_opportunities(user_id, opportunity_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS opportunity_snapshots (
          opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
          content_hash TEXT,
          page_title TEXT NOT NULL DEFAULT '',
          text_excerpt TEXT NOT NULL DEFAULT '',
          final_url TEXT NOT NULL,
          last_http_status INTEGER,
          last_checked_at TEXT NOT NULL,
          last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS opportunity_change_events (
          id TEXT PRIMARY KEY,
          opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
          change_type TEXT NOT NULL,
          content_hash_before TEXT NOT NULL,
          content_hash_after TEXT NOT NULL,
          title_before TEXT NOT NULL DEFAULT '',
          title_after TEXT NOT NULL DEFAULT '',
          excerpt_before TEXT NOT NULL DEFAULT '',
          excerpt_after TEXT NOT NULL DEFAULT '',
          detected_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS monitoring_runs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
          started_at TEXT NOT NULL,
          finished_at TEXT,
          checked_count INTEGER NOT NULL DEFAULT 0,
          changed_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          summary_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_watchlist_preferences_user ON watchlist_preferences(user_id);
        CREATE INDEX IF NOT EXISTS idx_change_events_opportunity ON opportunity_change_events(opportunity_id, detected_at);
        CREATE INDEX IF NOT EXISTS idx_change_events_detected ON opportunity_change_events(detected_at);
        CREATE INDEX IF NOT EXISTS idx_monitoring_runs_started ON monitoring_runs(started_at);
      `);

      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        2,
        'trust_intelligence_watchlist_monitoring',
        new Date().toISOString()
      );
    });
    migrate2();
  }

  if (!applied.has(3)) {
    const migrate3 = db.transaction(() => {
      db.exec(`
        ALTER TABLE messages
          ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'guided'
          CHECK (response_mode IN ('guided', 'gemini'));

        CREATE TABLE IF NOT EXISTS ai_user_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          external_ai_consent INTEGER NOT NULL DEFAULT 0 CHECK (external_ai_consent IN (0, 1)),
          consent_version TEXT,
          consent_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS ai_daily_usage (
          quota_date TEXT NOT NULL,
          scope_key TEXT NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
          PRIMARY KEY (quota_date, scope_key)
        );

        CREATE TABLE IF NOT EXISTS ai_request_leases (
          id TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_request_leases_expiry ON ai_request_leases(expires_at);
      `);

      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        3,
        'free_ai_privacy_quota_controls',
        new Date().toISOString()
      );
    });
    migrate3();
  }
}

function seedInitialData(db: Database.Database): void {
  const isProd = process.env.NODE_ENV === 'production';
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const now = new Date().toISOString();

  if (userCount === 0 && !isProd) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, avatar_url, is_active, preferred_language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'en', ?, ?)
    `);

    const studentId = 'usr_student_demo';
    const modId = 'usr_mod_demo';
    const adminId = 'usr_admin_demo';

    insertUser.run(
      studentId,
      'student@proofpath.ai',
      hashPassword('Student@2026!'),
      'Amina Rahman',
      'student',
      '/src/assets/images/avatar_student_lead_1794640632225.jpg',
      now,
      now
    );
    insertUser.run(
      modId,
      'moderator@proofpath.ai',
      hashPassword('Moderator@2026!'),
      'Elena Vance',
      'moderator',
      '/src/assets/images/avatar_admin_analyst_1794640633226.jpg',
      now,
      now
    );
    insertUser.run(
      adminId,
      'admin@proofpath.ai',
      hashPassword('Admin@2026!'),
      'Dr. Marcus Sterling',
      'admin',
      '/src/assets/images/avatar_admin_analyst_1794640633226.jpg',
      now,
      now
    );

    db.prepare(`
      INSERT INTO student_profiles (
        user_id, nationality, country_of_residence, age, education_level, gpa, gpa_scale,
        english_proficiency, english_score, financial_need, academic_interests_json, target_countries_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      'Bangladesh',
      'Bangladesh',
      22,
      'masters',
      3.78,
      4.0,
      'IELTS',
      '7.5',
      'full_funding',
      JSON.stringify(['Computer Science', 'Artificial Intelligence', 'Public Policy']),
      JSON.stringify(['United Kingdom', 'Germany', 'United States', 'Japan']),
      now
    );

    const insertPref = db.prepare(`
      INSERT INTO notification_preferences (user_id, in_app_deadlines, in_app_verifications, in_app_applications, in_app_security, deadline_days_before, updated_at)
      VALUES (?, 1, 1, 1, 1, 14, ?)
    `);
    insertPref.run(studentId, now);
    insertPref.run(modId, now);
    insertPref.run(adminId, now);
  }

  const contentCount = (db.prepare('SELECT COUNT(*) as c FROM site_content').get() as { c: number }).c;
  if (contentCount === 0) {
    db.prepare(`
      INSERT INTO site_content (key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(
      'landing_announcement',
      JSON.stringify({
        headline: 'Your Future Deserves Clearer Opportunity Records.',
        subheadline:
          'Explore scholarship records, review submitted opportunity details, and plan applications with eligibility checks tied to your ProofPath profile.',
        trustBanner: 'Local reviews show limitations and flag details that need confirmation with the provider.',
      }),
      isProd ? null : 'usr_admin_demo',
      now
    );
  }

  db.prepare(`
    UPDATE site_content
    SET value_json = json_set(
      value_json,
      '$.headline', ?,
      '$.subheadline', ?,
      '$.trustBanner', ?
    )
    WHERE key = 'landing_announcement'
      AND json_extract(value_json, '$.headline') = 'Your Future Deserves Verified Opportunities.'
  `).run(
    'Your Future Deserves Clearer Opportunity Records.',
    'Explore scholarship records, review submitted opportunity details, and plan applications with eligibility checks tied to your ProofPath profile.',
    'Local reviews show limitations and flag details that need confirmation with the provider.'
  );
}

export function mapUserRow(row: UserRecord): SafeUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    avatarUrl: row.avatar_url,
    isActive: row.is_active === 1,
    preferredLanguage: row.preferred_language,
    createdAt: row.created_at,
  };
}

export function mapOpportunityRow(row: Record<string, unknown>): OpportunityRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    organization: String(row.organization),
    country: String(row.country),
    category: row.category as OpportunityRecord['category'],
    educationLevel: row.education_level as OpportunityRecord['educationLevel'],
    fundingType: row.funding_type as OpportunityRecord['fundingType'],
    fundingAmount: String(row.funding_amount),
    minGpa: row.min_gpa === null || row.min_gpa === undefined ? null : Number(row.min_gpa),
    englishReq: String(row.english_req || ''),
    eligibleNationalities: JSON.parse(String(row.eligible_nationalities_json || '["All"]')),
    minAge: row.min_age === null || row.min_age === undefined ? null : Number(row.min_age),
    maxAge: row.max_age === null || row.max_age === undefined ? null : Number(row.max_age),
    deadline: String(row.deadline),
    officialUrl: String(row.official_url),
    description: String(row.description),
    requirements: JSON.parse(String(row.requirements_json || '[]')),
    verificationStatus: row.verification_status as OpportunityRecord['verificationStatus'],
    lastVerifiedAt: String(row.last_verified_at),
    isPublished: Number(row.is_published) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapProfileRow(row: Record<string, unknown> | undefined): StudentProfile | null {
  if (!row) return null;
  return {
    userId: String(row.user_id),
    nationality: String(row.nationality || ''),
    countryOfResidence: String(row.country_of_residence || ''),
    age: row.age === null || row.age === undefined ? null : Number(row.age),
    educationLevel: (row.education_level as StudentProfile['educationLevel']) || '',
    gpa: row.gpa === null || row.gpa === undefined ? null : Number(row.gpa),
    gpaScale: Number(row.gpa_scale || 4.0),
    englishProficiency: String(row.english_proficiency || ''),
    englishScore: String(row.english_score || ''),
    financialNeed: (row.financial_need as StudentProfile['financialNeed']) || 'any',
    academicInterests: JSON.parse(String(row.academic_interests_json || '[]')),
    targetCountries: JSON.parse(String(row.target_countries_json || '[]')),
    updatedAt: String(row.updated_at),
  };
}

export function writeAuditLog(
  db: Database.Database,
  params: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  db.prepare(`
    INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, ip_address, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aud_${crypto.randomUUID()}`,
    params.actorUserId,
    params.action,
    params.targetType,
    params.targetId,
    params.ipAddress || null,
    JSON.stringify(params.metadata || {}),
    new Date().toISOString()
  );
}

export function createNotification(
  db: Database.Database,
  params: {
    userId: string;
    type: 'deadline' | 'verification' | 'application' | 'security' | 'moderation';
    title: string;
    message: string;
    link?: string;
  }
): void {
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, link, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    `notif_${crypto.randomUUID()}`,
    params.userId,
    params.type,
    params.title,
    params.message,
    params.link || '/dashboard',
    new Date().toISOString()
  );
}
