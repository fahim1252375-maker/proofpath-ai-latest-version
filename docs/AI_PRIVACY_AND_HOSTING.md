# AI privacy, quota, migration, and hosting guide

## Gemini Copilot

The server allowlists `gemini-4-hydrogen`. Google's [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) effective March 23, 2026 require API users to be 18 or older and prohibit using the services as part of an API client directed to or likely to be accessed by under-18 users. ProofPath is a student-facing service and may be accessed by minors. **Gemini must remain disabled unless a documented audience and legal review confirms compatibility. An age checkbox or user consent alone does not establish compatibility.** Unpaid-service prompts and responses may be used to improve Google products and may be reviewed by humans. Do not send sensitive, confidential, or personal student information. The server allowlists one Gemini model, but provider allowlisting does not constitute policy approval. ProofPath does not configure Search grounding or display its citations.

The application therefore fails closed:

- `AI_ENABLED=false`, `AI_FREE_TIER_CONFIRMED=false`, `AI_STUDENT_AUDIENCE_APPROVED=false`, and `AI_GLOBAL_DAILY_LIMIT=0` disable Google requests by default.
- Keep `AI_STUDENT_AUDIENCE_APPROVED=false` for this student-facing product unless its actual audience and workflows have been reviewed against the current terms and confirmed compatible. This is an operator attestation, not an age gate or legal determination.
- Keep those defaults unless the API key is confirmed to use a Free-tier project with no paid billing attached. This app cannot detect a project's billing tier from an API key.
- Only after the audience review and separate project/quota review, set `AI_STUDENT_AUDIENCE_APPROVED=true`, `AI_FREE_TIER_CONFIRMED=true`, `AI_GLOBAL_DAILY_LIMIT` no higher than the currently displayed project quota, and then `AI_ENABLED=true`.
- Each student is capped at 10 reserved requests per Pacific calendar day by default. Project and per-user counters persist in SQLite. The app also limits concurrency, input/output size, and request duration. Requests are counted before calling Google, including failed calls, to prevent retry loops.
- Google quota may change or return 429. The app does not automatically retry or switch providers; it returns the local guided response. Project quota resets at midnight Pacific time. The per-user 10/day allowance is a conservative product limit, not a claim about Google's quota.
- When Gemini is enabled and a student opts in, only the current message is submitted. The server removes obvious email, phone, and labeled identity-number patterns first, but the redaction is best-effort. It never sends profile fields, conversation history, saved verification records, or file bytes. The UI discloses Free-tier data use and supports consent revocation; changing the disclosure version expires prior consent.
- Gemini receives no Google Search, URL Context, or file upload tool. Personalized eligibility checks and record links are computed locally and labeled as estimates. No personalized public response cache is used.

The free-tier project limit is not available from the connected tools. `AI_GLOBAL_DAILY_LIMIT` therefore remains zero in the example configuration. A maintainer must inspect the intended API project in [Google AI Studio](https://aistudio.google.com/) before enabling calls.

## Local Ollama and OpenJarvis providers

The assistant can use Ollama or OpenJarvis when the ProofPath backend runs on the same machine as the local model service. Provider URLs are read from server environment variables, must use HTTP on a loopback host (`127.0.0.1`, `localhost`, or `::1`), and are never sent to the browser. Ollama defaults to `http://127.0.0.1:11434` and model `qwen3.5:2b`; OpenJarvis is off until `OPENJARVIS_BASE_URL` is configured. The status endpoint reports whether the selected model is listed by the local service.

OpenJarvis provides an OpenAI-compatible `jarvis serve` command. Bind it explicitly to loopback, for example `jarvis serve --host 127.0.0.1 --port 8000 --engine ollama --model qwen3.5:2b`, then configure `OPENJARVIS_BASE_URL=http://127.0.0.1:8000` and the matching `OPENJARVIS_MODEL` in the backend environment. Verify the local configuration and model with `jarvis doctor`; an installed CLI or downloaded model alone does not mean the API is running.

These services must not be exposed through a tunnel or a public listener. On a hosted deployment, loopback refers to the server host, not a student's computer. The public site does not connect to the student's Mac. The assistant sends only the current redacted message to a selected local provider, has no tool execution enabled for model responses, and appends ProofPath's deterministic record checks on the server. Local providers do not receive profile fields, conversation history, private reports, or files.

## Local guided mode and evidence reports

Guided Mode runs without an AI provider. It checks stored eligibility rules, profile gaps, tracked application deadlines, and published opportunity records. It includes links only from those database rows, labels eligibility as an estimate, and directs students to confirm time-sensitive details with the provider.

Although the selected Gemini model supports Search grounding, this application does not send Search tool requests or receive its source citations. URL/text reviews return `INSUFFICIENT_EVIDENCE` unless independently checked by a person. File contents are not extracted or sent to Google and are not stored in the report. These responses are not positive verification results.

## Migration v3

Migration 3 is additive. It adds an assistant response-mode column, user AI-consent settings, persistent daily quota counters, and short-lived concurrency leases. It does not delete, rewrite, or reseed existing users, profiles, applications, reports, opportunities, or messages.

### Backup before migration

1. Choose a private, encrypted destination outside the app directory and outside any ephemeral service filesystem.
2. Set `DB_PATH` to the source database and run `npx tsx scripts/backup-sqlite.ts /secure/offsite/proofpath-before-v3.db`. The script refuses to overwrite an existing destination, uses SQLite's online backup API (including WAL state), runs an integrity check, and prints table counts only.
3. Copy the resulting file to a second access-controlled backup location. Never put database backups in GitHub, public object storage, or the web root.
4. After deploying, check `/api/health` for schema version `3`, then run the same backup validation command against the new database.

### Rollback

If the application release needs to be rolled back, redeploy the previous application code and leave the additive v3 columns/tables in place; older code ignores them. Do not manually drop v3 schema. Restore a pre-migration backup only if the database is corrupt and after accounting for any writes made since that backup. A restore overwrites newer data and must be reviewed by the data owner.

### Validation

The test suite covers v3 initialization, persistent counters, concurrency leases, Pacific-day reset boundaries, guided replies, consent, and cross-user report/conversation isolation. For a production database, validate `PRAGMA integrity_check`, schema migration versions, and core table row counts against the pre-migration backup before inviting students.

## Hosting options

### Zero-cost pilot: Render Free + Neon Free Postgres

This is safer for persistence than placing SQLite on Render Free, but it requires a substantial database port. The server currently uses synchronous `better-sqlite3`, positional `?` placeholders, SQLite migrations, and SQLite-specific SQL. A Neon pilot would need a PostgreSQL driver, async transaction/query handling, migration conversion, SQL portability review, and a tested one-time data migration with row-count checks and rollback. That port is not included here.

Neon's Free plan currently lists 1 GB storage per project, 100 compute-hours per month, and scale-to-zero after five idle minutes. It offers one manual snapshot and a six-hour history window. This can support a small non-critical pilot with scheduled offsite backups, but it is not the same as an always-on, backed-up production service. [Neon Free plan](https://neon.tech/pricing) · [Neon plan limits and recovery](https://neon.tech/docs/introduction/plans)

Supabase Free is another PostgreSQL option: $0, 500 MB database, 5 GB egress, and projects pause after a week of inactivity. Its Free plan has no automatic backups; Pro starts at $25/month and includes daily backups retained for seven days. [Supabase pricing](https://supabase.com/pricing) · [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

Do not combine Render Free with SQLite for real student data. Free web services spin down after 15 minutes and lose local filesystem changes on spin-down, restart, and redeploy; Render explicitly says not to use Free services for production. A Render Free Postgres database also expires after 30 days. [Render Free limits](https://render.com/docs/free)

### Production while retaining SQLite

Recommended with the current code: keep the existing Render web service, move it to the Starter compute plan, attach a 1 GB persistent disk mounted at `/var/data/proofpath`, and set `DB_PATH=/var/data/proofpath/proofpath.db`. Set the health-check path to `/api/health`; retain the current `npm ci --include=dev --no-audit --no-fund && npm run build` build command and `npm start` start command. Keep it single-instance because Render disks are single-instance and SQLite is local.

The current Render list price is $7/month for Starter compute plus $0.25 per GB-month for a persistent disk, so a 1 GB disk totals approximately **$7.25/month**, before outbound bandwidth overages, taxes, or any separate domain. Render's pricing page lists 5 GB included outbound bandwidth and $0.15/GB beyond that. Disk-backed deploys briefly stop the current instance and do not support zero-downtime swaps. [Render pricing](https://render.com/pricing) · [Persistent disk behavior](https://render.com/docs/disks)

This estimate is the lowest-cost direct path that preserves the current SQLite application design. It is not authorized or provisioned. Until the service is upgraded, the live free demo is not safe for durable student data. A disk is not an offsite backup: keep encrypted, tested database backups outside Render and practice restoring them.

## Current connected Render service (read-only inspection)

- Service: `proofpath-ai-demo` (`srv-dbs5etmk1f9s738aq670`), region Singapore, URL `https://proofpath-ai-demo.onrender.com`.
- Linked repository/branch: `fahim1252375-maker/proofpath-ai`, `main`; automatic deploy on commit is enabled.
- Current plan: Free. Build command: `npm ci --include=dev --no-audit --no-fund && npm run build`; start command: `npm start`.
- Health-check path is blank. No persistent disk is attached. Latest inspected live deployment commit was `d753671fa70e853825b331603df5b6c11d1c21b4`.
- The connected Render tools exposed service configuration and deployment metadata, but not environment variable names or values. No secret values were requested or printed. Verify required names in the Render dashboard before any approved production change.
- Do not enable auto-deploy to a paid configuration, upgrade, add a disk, modify environment variables, or trigger a deployment until the deployment plan and backup are approved.

## Environment checklist

Required for a production service:

- `NODE_ENV=production`
- `APP_URL=https://<approved-hostname>`
- `SESSION_SECRET=<unique random value of at least 32 characters>`
- `DB_PATH=/var/data/proofpath/proofpath.db` on the mounted persistent disk
- `MONITORING_CRON_SECRET=<separate random value>` if the existing scheduled opportunity monitor is used
- `AI_ENABLED=false`, `AI_FREE_TIER_CONFIRMED=false`, `AI_GLOBAL_DAILY_LIMIT=0` until the Gemini Free project/quota has been verified
- `AI_STUDENT_AUDIENCE_APPROVED=false` unless a documented audience review confirms current Gemini terms compatibility
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OPENJARVIS_BASE_URL`, `OPENJARVIS_MODEL`, `OPENJARVIS_API_KEY` only when a local provider is intentionally configured on the same backend host; URLs must remain loopback-only
- `GEMINI_API_KEY` only if the Copilot is approved and enabled; set in server secrets, never print it or add it to `.env.example`

The API health endpoint returns database connectivity, schema version, and whether the copilot gates are ready. It does not reveal key presence or database error details.
