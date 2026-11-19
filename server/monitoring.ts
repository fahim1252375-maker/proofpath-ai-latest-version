import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { createNotification } from './db.ts';
import { assertSafePublicUrl, fetchPublicUrlSnippet } from './ssrf.ts';

interface MonitoringOptions {
  limit?: number;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function notifyWatchers(
  db: Database.Database,
  opportunity: { id: string; title: string },
  eventId: string,
  message: string
): Promise<number> {
  const watchers = db.prepare(
    `SELECT s.user_id, COALESCE(p.notify_changes, COALESCE(np.in_app_verifications, 1)) AS notify_changes
     FROM saved_opportunities s
     LEFT JOIN watchlist_preferences p
       ON p.user_id = s.user_id AND p.opportunity_id = s.opportunity_id
     LEFT JOIN notification_preferences np ON np.user_id = s.user_id
     WHERE s.opportunity_id = ?`
  ).all(opportunity.id) as Array<{ user_id: string; notify_changes: number }>;

  let created = 0;
  for (const watcher of watchers) {
    if (watcher.notify_changes !== 1) continue;
    const link = '/opportunities/' + opportunity.id + '?change=' + eventId;
    const exists = db.prepare(
      'SELECT 1 FROM notifications WHERE user_id = ? AND link = ?'
    ).get(watcher.user_id, link);
    if (!exists) {
      createNotification(db, {
        userId: watcher.user_id,
        type: 'verification',
        title: 'Opportunity page updated: ' + opportunity.title,
        message,
        link,
      });
      created += 1;
    }
  }
  return created;
}

async function createDeadlineAlerts(db: Database.Database): Promise<number> {
  const rows = db.prepare(
    `SELECT s.user_id, o.id AS opportunity_id, o.title, o.deadline,
            COALESCE(p.notify_deadlines, COALESCE(np.in_app_deadlines, 1)) AS notify_deadlines,
            COALESCE(p.deadline_days_before, 14) AS deadline_days_before
     FROM saved_opportunities s
     JOIN opportunities o ON o.id = s.opportunity_id
     LEFT JOIN watchlist_preferences p
       ON p.user_id = s.user_id AND p.opportunity_id = s.opportunity_id
     LEFT JOIN notification_preferences np ON np.user_id = s.user_id
     WHERE o.is_published = 1`
  ).all() as Array<{
    user_id: string; opportunity_id: string; title: string;
    deadline: string; notify_deadlines: number; deadline_days_before: number;
  }>;

  const now = Date.now();
  let created = 0;
  for (const row of rows) {
    if (row.notify_deadlines !== 1) continue;
    const deadline = new Date(row.deadline + (row.deadline.length === 10 ? 'T23:59:59Z' : '')).getTime();
    if (!Number.isFinite(deadline)) continue;
    const daysLeft = Math.ceil((deadline - now) / 86400000);
    if (daysLeft < 0 || daysLeft > row.deadline_days_before) continue;

    const title = 'Deadline in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ': ' + row.title;
    const link = '/opportunities/' + row.opportunity_id + '?deadline=' + row.deadline + '&days=' + daysLeft;
    const exists = db.prepare(
      'SELECT 1 FROM notifications WHERE user_id = ? AND link = ?'
    ).get(row.user_id, link);
    if (!exists) {
      createNotification(db, {
        userId: row.user_id,
        type: 'deadline',
        title,
        message: 'The listed application deadline is ' + row.deadline + '. Recheck the official portal before submitting.',
        link,
      });
      created += 1;
    }
  }
  return created;
}

export async function runMonitoringCycle(
  db: Database.Database,
  options: MonitoringOptions = {}
): Promise<Record<string, number | string>> {
  const limit = Math.max(1, Math.min(30, Math.floor(options.limit || 16)));
  const runId = 'run_' + crypto.randomUUID();
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO monitoring_runs
     (id, status, started_at, finished_at, checked_count, changed_count, error_count, summary_json)
     VALUES (?, 'running', ?, NULL, 0, 0, 0, '{}')`
  ).run(runId, startedAt);

  let checkedCount = 0;
  let changedCount = 0;
  let errorCount = 0;
  let notificationsCreated = 0;

  const candidates = db.prepare(
    `SELECT o.id, o.title, o.official_url, o.last_verified_at
     FROM opportunities o
     LEFT JOIN opportunity_snapshots s ON s.opportunity_id = o.id
     WHERE o.is_published = 1 AND o.official_url <> ''
     ORDER BY COALESCE(s.last_checked_at, '') ASC, o.last_verified_at ASC
     LIMIT ?`
  ).all(limit) as Array<{ id: string; title: string; official_url: string; last_verified_at: string }>;

  for (const candidate of candidates) {
    let finalUrl = candidate.official_url;
    try {
      const safeUrl = await assertSafePublicUrl(candidate.official_url);
      const page = await fetchPublicUrlSnippet(safeUrl);
      finalUrl = page.finalUrl || candidate.official_url;
      const checkedAt = new Date().toISOString();
      if (!page.reachable) {
        db.prepare(
          `INSERT INTO opportunity_snapshots
           (opportunity_id, content_hash, page_title, text_excerpt, final_url, last_http_status, last_checked_at, last_error)
           VALUES (?, NULL, '', '', ?, ?, ?, 'The public page could not be retrieved.')
           ON CONFLICT(opportunity_id) DO UPDATE SET
             final_url = excluded.final_url,
             last_http_status = excluded.last_http_status,
             last_checked_at = excluded.last_checked_at,
             last_error = excluded.last_error`
        ).run(candidate.id, finalUrl, page.statusCode, checkedAt);
        errorCount += 1;
        continue;
      }

      const pageTitle = page.pageTitle || candidate.title;
      const excerpt = page.textExcerpt.slice(0, 6000);
      const contentHash = sha256(pageTitle + '\n' + excerpt);
      const previous = db.prepare(
        'SELECT content_hash, page_title, text_excerpt FROM opportunity_snapshots WHERE opportunity_id = ?'
      ).get(candidate.id) as { content_hash: string | null; page_title: string | null; text_excerpt: string | null } | undefined;

      db.prepare(
        `INSERT INTO opportunity_snapshots
         (opportunity_id, content_hash, page_title, text_excerpt, final_url, last_http_status, last_checked_at, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(opportunity_id) DO UPDATE SET
           content_hash = excluded.content_hash,
           page_title = excluded.page_title,
           text_excerpt = excluded.text_excerpt,
           final_url = excluded.final_url,
           last_http_status = excluded.last_http_status,
           last_checked_at = excluded.last_checked_at,
           last_error = NULL`
      ).run(candidate.id, contentHash, pageTitle, excerpt, finalUrl, page.statusCode, checkedAt);

      if (previous && previous.content_hash && previous.content_hash !== contentHash) {
        const eventId = 'change_' + crypto.randomUUID();
        db.prepare(
          `INSERT INTO opportunity_change_events
           (id, opportunity_id, change_type, content_hash_before, content_hash_after,
            title_before, title_after, excerpt_before, excerpt_after, detected_at)
           VALUES (?, ?, 'content_changed', ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          eventId,
          candidate.id,
          previous.content_hash,
          contentHash,
          previous.page_title || candidate.title,
          pageTitle,
          String(previous.text_excerpt || '').slice(0, 800),
          excerpt.slice(0, 800),
          checkedAt
        );
        notificationsCreated += await notifyWatchers(
          db,
          { id: candidate.id, title: candidate.title },
          eventId,
          'The monitored public page content differs from the previous successful check. Review the change history and confirm any deadline or eligibility update directly with the official provider.'
        );
        changedCount += 1;
      }
      checkedCount += 1;
    } catch (error) {
      errorCount += 1;
      db.prepare(
        `INSERT INTO opportunity_snapshots
         (opportunity_id, content_hash, page_title, text_excerpt, final_url, last_checked_at, last_error)
         VALUES (?, NULL, '', '', ?, ?, ?)
         ON CONFLICT(opportunity_id) DO UPDATE SET
           final_url = excluded.final_url,
           last_checked_at = excluded.last_checked_at,
           last_error = excluded.last_error`
      ).run(
        candidate.id,
        finalUrl,
        new Date().toISOString(),
        error instanceof Error ? error.message.slice(0, 500) : 'Page check failed.'
      );
    }
  }

  const deadlineAlertsCreated = await createDeadlineAlerts(db);
  const finishedAt = new Date().toISOString();
  db.prepare(
    `UPDATE monitoring_runs
     SET status = ?, finished_at = ?, checked_count = ?, changed_count = ?, error_count = ?, summary_json = ?
     WHERE id = ?`
  ).run(
    errorCount > 0 && checkedCount === 0 ? 'failed' : 'completed',
    finishedAt,
    checkedCount,
    changedCount,
    errorCount,
    JSON.stringify({ deadlineAlertsCreated, notificationsCreated, candidates: candidates.length }),
    runId
  );

  return {
    runId,
    checkedCount,
    changedCount,
    errorCount,
    deadlineAlertsCreated,
    notificationsCreated,
  };
}
