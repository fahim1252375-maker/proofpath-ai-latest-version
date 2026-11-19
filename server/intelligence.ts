import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { Express, Request, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { mapOpportunityRow, mapProfileRow } from './db.ts';
import { scoreSourceCredibility } from './source-credibility.ts';
import { runMonitoringCycle } from './monitoring.ts';
import { evaluateEligibility } from './eligibility.ts';
import type { SafeUser, UserRole } from './types.ts';

type AuthenticatedRequest = Request & { authUser?: SafeUser };

function currentUser(req: Request): SafeUser {
  const user = (req as AuthenticatedRequest).authUser;
  if (!user) throw new Error('Authenticated user context is missing.');
  return user;
}

function safeHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function normalizeClaim(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function timingSafeSecretMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

export function registerIntelligenceRoutes(
  app: Express,
  db: Database.Database,
  requireAuth: RequestHandler,
  requireRole: (...roles: UserRole[]) => RequestHandler
): void {
  app.get('/api/watchlist', requireAuth, (req, res) => {
    const user = currentUser(req);
    const rows = db.prepare(
      `SELECT o.*, s.created_at AS saved_at,
              COALESCE(w.notify_deadlines, 1) AS notify_deadlines,
              COALESCE(w.notify_changes, 1) AS notify_changes,
              COALESCE(w.deadline_days_before, 14) AS deadline_days_before
       FROM saved_opportunities s
       JOIN opportunities o ON o.id = s.opportunity_id
       LEFT JOIN watchlist_preferences w
         ON w.user_id = s.user_id AND w.opportunity_id = s.opportunity_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC`
    ).all(user.id) as Array<Record<string, unknown>>;

    const items = rows.map((row) => {
      const opportunity = mapOpportunityRow(row);
      const changes = db.prepare(
        `SELECT id, change_type, title_before, title_after, excerpt_before, excerpt_after, detected_at
         FROM opportunity_change_events
         WHERE opportunity_id = ?
         ORDER BY detected_at DESC LIMIT 3`
      ).all(opportunity.id);
      return {
        ...opportunity,
        savedAt: String(row.saved_at),
        preferences: {
          notifyDeadlines: Number(row.notify_deadlines) === 1,
          notifyChanges: Number(row.notify_changes) === 1,
          deadlineDaysBefore: Number(row.deadline_days_before),
        },
        recentChanges: changes,
      };
    });
    res.json({ items });
  });

  app.put('/api/watchlist/:opportunityId/preferences', requireAuth, (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      notifyDeadlines: z.boolean(),
      notifyChanges: z.boolean(),
      deadlineDaysBefore: z.number().int().min(1).max(60),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid watchlist notification preferences.' });
      return;
    }

    const saved = db.prepare(
      'SELECT 1 FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?'
    ).get(user.id, req.params.opportunityId);
    if (!saved) {
      res.status(404).json({ error: 'Save this opportunity before configuring its alerts.' });
      return;
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO watchlist_preferences
       (user_id, opportunity_id, notify_deadlines, notify_changes, deadline_days_before, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, opportunity_id) DO UPDATE SET
         notify_deadlines = excluded.notify_deadlines,
         notify_changes = excluded.notify_changes,
         deadline_days_before = excluded.deadline_days_before,
         updated_at = excluded.updated_at`
    ).run(
      user.id,
      req.params.opportunityId,
      d.notifyDeadlines ? 1 : 0,
      d.notifyChanges ? 1 : 0,
      d.deadlineDaysBefore,
      now,
      now
    );
    res.json({ preferences: d });
  });

  app.get('/api/trust/summary', requireAuth, (req, res) => {
    const user = currentUser(req);
    const watchlistCount = (db.prepare(
      'SELECT COUNT(*) AS count FROM saved_opportunities WHERE user_id = ?'
    ).get(user.id) as { count: number }).count;
    const pendingReports = (db.prepare(
      `SELECT COUNT(*) AS count FROM community_reports
       WHERE user_id = ? AND status IN ('pending', 'reviewing')`
    ).get(user.id) as { count: number }).count;
    const recentChanges = (db.prepare(
      `SELECT COUNT(*) AS count FROM opportunity_change_events
       WHERE detected_at >= datetime('now', '-30 days')`
    ).get() as { count: number }).count;
    const lastRun = db.prepare(
      'SELECT id, status, started_at, finished_at, checked_count, changed_count, error_count FROM monitoring_runs ORDER BY started_at DESC LIMIT 1'
    ).get() as Record<string, unknown> | undefined;

    res.json({
      watchlistCount,
      pendingSafetyReports: pendingReports,
      recentOpportunityChanges: recentChanges,
      monitoring: {
        configured: Boolean(process.env.MONITORING_CRON_SECRET && process.env.MONITORING_CRON_SECRET.length >= 32),
        lastRun: lastRun || null,
      },
      delivery: {
        inApp: true,
      },
    });
  });

  app.get('/api/opportunities/:id/intelligence', (req, res) => {
    const row = db.prepare(
      'SELECT * FROM opportunities WHERE (id = ? OR slug = ?) AND is_published = 1'
    ).get(req.params.id, req.params.id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Opportunity not found.' });
      return;
    }

    const opportunity = mapOpportunityRow(row);
    const sourceAssessment = scoreSourceCredibility(opportunity.officialUrl, opportunity.officialUrl);
    const snapshots = db.prepare(
      `SELECT page_title, final_url, last_checked_at, last_error
       FROM opportunity_snapshots WHERE opportunity_id = ?`
    ).get(opportunity.id) as Record<string, unknown> | undefined;
    const changes = db.prepare(
      `SELECT id, change_type, title_before, title_after, excerpt_before, excerpt_after, detected_at
       FROM opportunity_change_events WHERE opportunity_id = ?
       ORDER BY detected_at DESC LIMIT 10`
    ).all(opportunity.id);
    const communityRows = db.prepare(
      `SELECT reason, status, COUNT(*) AS count
       FROM community_reports
       WHERE opportunity_id = ?
       GROUP BY reason, status`
    ).all(opportunity.id) as Array<{ reason: string; status: string; count: number }>;

    const communitySignals = {
      totalReports: communityRows.reduce((sum, item) => sum + item.count, 0),
      pending: communityRows.filter((item) => item.status === 'pending' || item.status === 'reviewing')
        .reduce((sum, item) => sum + item.count, 0),
      moderationOutcomes: {
        resolvedValid: communityRows.filter((item) => item.status === 'resolved_valid').reduce((sum, item) => sum + item.count, 0),
        dismissed: communityRows.filter((item) => item.status === 'dismissed').reduce((sum, item) => sum + item.count, 0),
      },
      reasons: communityRows.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + item.count;
        return acc;
      }, {} as Record<string, number>),
      disclaimer: 'Community submissions are user reports, not verified findings. Review status reflects moderation workflow and must not be interpreted as a legal or fraud determination.',
    };

    res.json({
      opportunityId: opportunity.id,
      sourceAssessment,
      monitoring: snapshots ? {
        lastCheckedAt: snapshots.last_checked_at,
        pageTitle: snapshots.page_title,
        finalUrl: snapshots.final_url,
        lastError: snapshots.last_error,
      } : null,
      changes,
      communitySignals,
    });
  });

  app.get('/api/eligibility/explain/:opportunityId', requireAuth, (req, res) => {
    const user = currentUser(req);
    const profileRow = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(user.id) as
      | Record<string, unknown>
      | undefined;
    const opportunityRow = db.prepare(
      'SELECT * FROM opportunities WHERE id = ? AND is_published = 1'
    ).get(req.params.opportunityId) as Record<string, unknown> | undefined;
    if (!opportunityRow) {
      res.status(404).json({ error: 'Opportunity not found.' });
      return;
    }

    const profile = mapProfileRow(profileRow);
    const opportunity = mapOpportunityRow(opportunityRow);
    if (!profile) {
      res.json({
        opportunityId: opportunity.id,
        status: 'MISSING_INFO',
        scoreLabel: 'Profile required',
        completeness: { provided: 0, required: 5, percentage: 0 },
        reasons: [],
        missingProfileFields: ['nationality', 'age', 'educationLevel', 'gpa', 'englishProficiency'],
        recommendedNextSteps: ['Complete your eligibility profile to receive a grounded assessment.'],
      });
      return;
    }

    const evaluation = evaluateEligibility(profile, opportunity);
    const missingProfileFields = [
      !profile.nationality && 'nationality',
      profile.age === null && 'age',
      !profile.educationLevel && 'educationLevel',
      profile.gpa === null && 'gpa',
      !profile.englishProficiency && 'englishProficiency',
    ].filter(Boolean);
    const requiredCount = 5;
    const providedCount = requiredCount - missingProfileFields.length;

    res.json({
      opportunityId: opportunity.id,
      status: evaluation.status,
      scoreLabel: evaluation.scoreLabel,
      completeness: {
        provided: providedCount,
        required: requiredCount,
        percentage: Math.round((providedCount / requiredCount) * 100),
      },
      reasons: evaluation.reasons,
      missingProfileFields,
      recommendedNextSteps: evaluation.recommendedNextSteps,
      methodology: 'Rule-based comparison against the published opportunity record. Missing values remain unknown; this is guidance, not an admission decision.',
    });
  });

  app.post('/api/verifications/compare', requireAuth, (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ reportIds: z.array(z.string().min(1)).min(2).max(4) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || new Set(parsed.data?.reportIds || []).size !== (parsed.data?.reportIds.length || 0)) {
      res.status(400).json({ error: 'Provide between 2 and 4 distinct report IDs.' });
      return;
    }

    const reports = parsed.data.reportIds.map((id) => db.prepare(
      'SELECT * FROM verification_reports WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined);
    if (reports.some((report) => !report)) {
      res.status(404).json({ error: 'One or more verification reports were not found.' });
      return;
    }
    const canReviewAll = user.role === 'admin' || user.role === 'moderator';
    for (const report of reports as Array<Record<string, unknown>>) {
      const ownerId = report.user_id ? String(report.user_id) : null;
      if (ownerId && ownerId !== user.id && !canReviewAll && report.id !== 'rep_seed_chevening') {
        res.status(403).json({ error: 'The comparison includes a private report you cannot access.' });
        return;
      }
    }

    const normalizedReports = (reports as Array<Record<string, unknown>>).map((report) => {
      const claims = JSON.parse(String(report.claims_json || '[]')) as Array<Record<string, unknown>>;
      const evidence = db.prepare(
        `SELECT claim_index, source_url, source_title, stance
         FROM evidence_records WHERE report_id = ? ORDER BY claim_index, source_url`
      ).all(String(report.id)) as Array<Record<string, unknown>>;
      return {
        id: String(report.id),
        title: String(report.submitted_title || report.submitted_url || 'Untitled submission'),
        createdAt: String(report.created_at),
        overallStatus: String(report.overall_status),
        claims: claims.map((claim) => ({
          claim: String(claim.claim || ''),
          normalizedClaim: normalizeClaim(String(claim.claim || '')),
          verdict: String(claim.verdict || 'UNVERIFIED'),
          explanation: String(claim.explanation || ''),
        })),
        evidence: evidence.map((source) => ({
          claimIndex: Number(source.claim_index),
          sourceUrl: String(source.source_url),
          sourceTitle: String(source.source_title),
          stance: String(source.stance),
          credibility: scoreSourceCredibility(String(source.source_url), String(report.submitted_url || '')),
        })),
        limitations: String(report.confidence_limitations || ''),
      };
    });

    const claimGroups = new Map<string, Array<{ reportId: string; claim: string; verdict: string }>>();
    for (const report of normalizedReports) {
      for (const claim of report.claims) {
        if (!claim.normalizedClaim) continue;
        const group = claimGroups.get(claim.normalizedClaim) || [];
        group.push({ reportId: report.id, claim: claim.claim, verdict: claim.verdict });
        claimGroups.set(claim.normalizedClaim, group);
      }
    }
    const sharedClaims = Array.from(claimGroups.values())
      .filter((group) => group.length > 1)
      .map((group) => ({
        claim: group[0].claim,
        occurrences: group.length,
        verdicts: group.map((item) => ({ reportId: item.reportId, verdict: item.verdict })),
        verdictConflict: new Set(group.map((item) => item.verdict)).size > 1,
      }));

    res.json({
      reports: normalizedReports,
      sharedClaims,
      methodology: 'Claims are grouped by normalized text; differing outcomes are highlighted for human review. Reports may refer to different pages or dates and are not interchangeable.',
    });
  });

  app.get('/api/admin/trust-analytics', requireRole('admin', 'moderator'), (_req, res) => {
    const stats = {
      publishedOpportunities: (db.prepare('SELECT COUNT(*) AS count FROM opportunities WHERE is_published = 1').get() as { count: number }).count,
      savedOpportunityLinks: (db.prepare('SELECT COUNT(*) AS count FROM saved_opportunities').get() as { count: number }).count,
      trackedChanges: (db.prepare('SELECT COUNT(*) AS count FROM opportunity_change_events').get() as { count: number }).count,
      unresolvedCommunityReports: (db.prepare("SELECT COUNT(*) AS count FROM community_reports WHERE status IN ('pending', 'reviewing')").get() as { count: number }).count,
      totalEvidenceLinks: (db.prepare('SELECT COUNT(*) AS count FROM evidence_records').get() as { count: number }).count,
    };
    const reportRows = db.prepare(
      'SELECT submitted_url, reason, status, user_id FROM community_reports ORDER BY created_at DESC LIMIT 500'
    ).all() as Array<{ submitted_url: string; reason: string; status: string; user_id: string | null }>;
    const hostGroups = new Map<string, { host: string; reports: number; pending: number; resolvedValid: number; dismissed: number; reasons: Record<string, number>; reporterIds: Set<string> }>();
    for (const report of reportRows) {
      const host = safeHost(report.submitted_url);
      const group = hostGroups.get(host) || {
        host, reports: 0, pending: 0, resolvedValid: 0, dismissed: 0, reasons: {} as Record<string, number>, reporterIds: new Set<string>(),
      };
      group.reports += 1;
      if (report.user_id) group.reporterIds.add(report.user_id);
      if (report.status === 'pending' || report.status === 'reviewing') group.pending += 1;
      if (report.status === 'resolved_valid') group.resolvedValid += 1;
      if (report.status === 'dismissed') group.dismissed += 1;
      group.reasons[report.reason] = (group.reasons[report.reason] || 0) + 1;
      hostGroups.set(host, group);
    }
    const recentSafetySignals = Array.from(hostGroups.values()).map((group) => {
      const uniqueReporters = group.reporterIds.size;
      const reasonDiversity = Object.keys(group.reasons).length;
      const riskSignal = group.reports >= 4 && uniqueReporters >= 3 && reasonDiversity >= 2
        ? 'Elevated review priority'
        : group.reports >= 2 && uniqueReporters >= 2
          ? 'Review suggested'
          : 'Low report volume';
      return {
        host: group.host,
        reports: group.reports,
        uniqueReporters,
        pending: group.pending,
        resolvedValid: group.resolvedValid,
        dismissed: group.dismissed,
        reasons: group.reasons,
        riskSignal,
      };
    }).sort((a, b) => b.reports - a.reports).slice(0, 10);

    const latestRun = db.prepare(
      'SELECT id, status, started_at, finished_at, checked_count, changed_count, error_count FROM monitoring_runs ORDER BY started_at DESC LIMIT 1'
    ).get() || null;
    const recentEvents = db.prepare(
      `SELECT e.id, e.change_type, e.title_before, e.title_after, e.detected_at, o.id AS opportunity_id
       FROM opportunity_change_events e JOIN opportunities o ON o.id = e.opportunity_id
       ORDER BY e.detected_at DESC LIMIT 20`
    ).all();

    res.json({
      stats,
      recentSafetySignals,
      recentChanges: recentEvents,
      latestMonitoringRun: latestRun,
      monitoringConfigured: Boolean(process.env.MONITORING_CRON_SECRET && process.env.MONITORING_CRON_SECRET.length >= 32),
      disclaimer: 'Community reports are allegations until reviewed. Counts indicate report activity, not proof that a domain or organization is fraudulent.',
    });
  });

  app.post('/api/internal/monitoring/run', async (req, res) => {
    const expected = process.env.MONITORING_CRON_SECRET || '';
    if (expected.length < 32) {
      res.status(503).json({ error: 'Scheduled monitoring is not configured on this deployment.' });
      return;
    }
    const authorization = String(req.headers.authorization || '');
    const provided = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : '';
    if (!timingSafeSecretMatch(provided, expected)) {
      res.status(401).json({ error: 'Invalid monitoring credential.' });
      return;
    }
    try {
      const result = await runMonitoringCycle(db, { limit: 4 });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[Monitoring] Scheduled cycle failed:', error);
      res.status(500).json({ error: 'Monitoring cycle failed.' });
    }
  });
}
