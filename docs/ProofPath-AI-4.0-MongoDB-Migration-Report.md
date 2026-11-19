# ProofPath AI 4.0 — MongoDB Migration Assessment

**Date:** 2026-11-19
**Decision:** **NOT IMPLEMENTED** — MongoDB migration deliberately not started. The current public-demo candidate remains SQLite-backed and read-only.

## 1. Connected Atlas resources observed

- One Atlas organization and one project were visible in the connected account.
- Existing cluster `Cluster0` is a FREE cluster in AWS `AP_SOUTH_1`, MongoDB `8.0.37`, state `IDLE`.
- Existing databases: `accesspath`, `blogspace`, `sample_mflix`, `admin`, and `local`.
- No ProofPath database or ProofPath-specific database user was found.
- The project IP access list includes `0.0.0.0/0` with a Render-related comment. This permits connections from anywhere and is not an acceptable security posture for a student application.
- The connected Render tools showed the existing ProofPath service in Singapore, but they did not expose the region-specific outbound IP ranges needed to replace the broad Atlas rule safely.
- Database listing used a read-only Atlas connection. No data documents, collection schemas, database users, IP lists, clusters or databases were changed.

No URI, password, key or private database document is included in this report.

## 2. Why a URI-only migration is unsafe

The application uses `better-sqlite3` and synchronous SQL calls. Business logic and route handlers use prepared SQL, joins, foreign keys, SQLite transactions, constraints, JSON columns and row mappers across server modules. MongoDB does not accept this SQL syntax or automatically preserve relational semantics.

A valid migration needs:
- a repository/data-access interface used by application/business logic;
- independently tested SQLite and MongoDB adapters;
- document schemas and validation;
- explicit ID/reference strategy and ownership filters;
- unique and compound indexes;
- pagination and bounded query access;
- transaction/session decisions against the actual Atlas topology;
- atomic counters/leases for AI quotas and concurrent requests;
- backup/export/import and reconciliation tooling;
- independent tests for cross-user isolation and authentication flows.

Changing only `DB_PATH` to `MONGODB_URI` or installing a driver would not migrate the application.

## 3. Table-to-document model proposal

The following is a conceptual mapping based on the SQLite tables in `server/db.ts`. **No collections were created.** Some normalized SQL entities may be embedded, while high-volume/auditable entities should remain separate collections.

| SQLite table | Proposed MongoDB collection/model | Relationship and index considerations |
|---|---|---|
| `users` | `users` | Unique normalized email; account status/role; never expose password hashes in API projections. |
| `sessions` | `sessions` | Unique token hash; TTL index on expiry with application-side expiration check; userId index. |
| `password_resets` | `passwordResets` | Unique token hash; TTL/used-state handling; userId index. |
| `student_profiles` | `studentProfiles` | Unique userId; profile owned by same user as parent account. |
| `opportunities` | `opportunities` | Unique slug; indexes for `isPublished`, `verificationStatus`, deadline, category/country and pagination sort. Publish-state invariant must be enforced atomically. |
| `verification_reports` | `verificationReports` | UserId + createdAt indexes; report IDs referenced by evidence records; private reports require owner filtering. |
| `evidence_records` | `evidenceRecords` or embedded claim evidence | ReportId + claimIndex indexes; source URL, retrieval timestamp, stance, and excerpt provenance. |
| `saved_opportunities` | `savedOpportunities` | Unique compound `(userId, opportunityId)`; userId/createdAt indexes. |
| `applications` | `applications` | UserId + deadline/status indexes; preserve owner-only read/update/delete behavior. |
| `application_documents` | embedded application documents or `applicationDocuments` | Parent application ID and user ownership; file metadata only until a safe document pipeline exists. |
| `notifications` | `notifications` | UserId + createdAt/isRead indexes; avoid unbounded reads. |
| `notification_preferences` | `notificationPreferences` | Unique userId. |
| `conversations` | `conversations` | UserId + createdAt indexes; private to owner. |
| `messages` | `messages` | ConversationId + createdAt; ownership must be checked through conversation/user. |
| `community_reports` | `communityReports` | Opportunity/report target + createdAt/status; moderation access control. |
| `moderation_logs` | `moderationLogs` | Target type/id + createdAt; append-oriented audit history. |
| `admin_audit_logs` | `adminAuditLogs` | CreatedAt and target indexes; append-only semantics and restricted admin access. |
| `ai_usage_logs` | `aiUsageLogs` | UserId + createdAt/provider; retention and minimization policy. |
| `ai_user_settings` | `aiUserSettings` | Unique userId; explicit consent version/withdrawal behavior. |
| `ai_daily_usage` | `aiDailyUsage` | Unique day/user/provider or project bucket; updates must be atomic. |
| `ai_request_leases` | `aiRequestLeases` | Unique lease key and expiry; concurrency/quota enforcement must be race-safe. |
| `contact_messages` | `contactMessages` | CreatedAt/status; minimize personal data and restrict admin reads. |
| `site_content` | `siteContent` | Unique key; public read / admin write split. |
| `watchlist_preferences` | `watchlistPreferences` | Unique userId/opportunityId or watchlist scope. |
| `opportunity_snapshots` | `opportunitySnapshots` | OpportunityId + retrievedAt; bounded snapshot retention. |
| `opportunity_change_events` | `opportunityChangeEvents` | OpportunityId + createdAt; append-only history. |
| `monitoring_runs` | `monitoringRuns` | Run status + createdAt; idempotency keys and retention. |
| `schema_migrations` | `migrationMetadata` | Version/name uniqueness; do not copy raw SQLite migration state blindly. |

Collection names, embedding boundaries, unique constraints and indexes must be finalized from the full SQL DDL and workload tests before implementation.

## 4. Security requirements before any Atlas connection

1. Keep `MONGODB_URI` in Render server-side secrets only. Never use a `VITE_` prefix or place it in source, ZIP, CI logs or browser output.
2. Create a new ProofPath database user restricted to the dedicated ProofPath database and the minimum required `readWrite` role; do not reuse the account's existing broad `readWriteAnyDatabase` users.
3. Remove the `0.0.0.0/0` rule only after the actual deployment egress model is known and a replacement allowlist is tested. Do not leave it in place for convenience.
4. Determine whether Render egress addresses are stable/allowlistable for the selected service/region. The connected service inventory did not provide them.
5. Enforce TLS, connection timeouts, finite pools, bounded retries and graceful shutdown.
6. Do not migrate real student records as part of a public demo.
7. Test database outage, retry safety, duplicate insert, ownership isolation, transaction boundaries, index use and restore.
8. Do not create a free cluster just because an existing cluster exists; use the current cluster only after network/security review and owner approval.

## 5. Safe next step

Keep the existing application on SQLite for the demo and set `DB_PATH` to an absolute ephemeral filesystem path on the Render Free container. This meets the production code's absolute-path guard but does **not** create durable storage; the public demo must block writes and warn that no student information may be submitted.

A proper MongoDB migration should be a separate engineering branch with the repository abstraction, adapter contract, migration/export tooling, tests, network policy and staged cutover plan. No such migration is claimed in this release.
