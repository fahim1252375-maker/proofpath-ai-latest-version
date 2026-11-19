# ProofPath AI 4.0 — Read-Only Demo Candidate Release Notes

**Date:** 2026-11-19
**Release artifact:** `ProofPath-AI-4.0-ReadOnly-Demo-Candidate.zip`
**Release state:** Local candidate only; not deployed.

## Baseline preserved

The candidate starts from the uploaded `ProofPath-AI-4.0-Post-Review-Fixes (2).zip`. It retains the existing React/TypeScript/Vite frontend, Express backend, SQLite schema/migrations, authentication code, Pathfinder, CV Studio, assistant-provider adapters, opportunity workflows and tests. The source ZIP and all connected live services were left unchanged.

The existing post-review publication controls remain in the candidate:
- new admin opportunities start unpublished and `UNVERIFIED`;
- draft review is protected;
- publication requires `VERIFIED`, an explicit reviewer action and a review note;
- verification downgrade unpublishes;
- production requires an explicit absolute `DB_PATH`;
- CI includes a high-severity npm audit gate.

## Changes in this continuation

1. Added server-side `DEMO_MODE` switch. Production defaults to read-only unless the operator explicitly sets `DEMO_MODE=false`; local development remains writable by default.
2. When enabled, the server rejects all API methods except GET, HEAD and OPTIONS with HTTP 403 and code `DEMO_READ_ONLY`. The middleware runs before route handlers so registration, login, profile changes, verification submissions, uploads, applications, assistant writes, community reports and admin mutations are rejected.
3. Public demo mode skips server-side session/cookie lookup, so a demo visitor cannot resume an authenticated account session. The public contact route also shows the demo-access notice instead of a personal-data form.
4. `/api/health` reports `demoMode: true` when the server demo gate is enabled.
5. Added `VITE_DEMO_MODE` frontend build switch. Production builds default to read-only unless explicitly set to `false`. Login, registration, password-reset and contact routes display a read-only demo access page. Public navigation replaces Sign In with Demo Preview.
6. Added a global visible notice: “DEMO VERSION — Do not submit real personal information. Accounts, uploads, submissions and changes are disabled.”
7. Disabled public verification submission, file selection, and community-report submission controls when frontend demo mode is enabled.
8. Added `OLLAMA_ENABLED`; hosted deployments should set it to false. Provider status text then says the operator disabled it. Existing loopback restrictions remain.
9. Added an API integration test for POST/PUT/PATCH/DELETE blocking, user-count invariance, demo health metadata and empty catalogue; added a provider test for the Ollama disable switch.
10. Updated CI push/PR triggers to include `deploy/**` branches while retaining lint, test, audit and build checks.
11. Replaced the opportunity monitor's hardcoded live URL with an explicit `MONITOR_URL` repository variable and made it skip unless both URL and secret are configured; it requires HTTPS.
12. Updated README to distinguish the existing Render deployment from this un-deployed candidate. Existing Pathfinder remains a temporary, deterministic, no-model guide whose selections are not saved.

## Configuration for hosted demo

Set both:
- `DEMO_MODE=true` at server runtime.
- `VITE_DEMO_MODE=true` at build time.

Also set `OLLAMA_ENABLED=false`, keep all Gemini gates false, leave OpenJarvis URL/key unset, and do not set `MONGODB_URI`. Use only a throwaway absolute database path because the Free container filesystem is ephemeral and the demo has no data-persistence promise.

## Verification status

- Input ZIP extraction and integrity check: COMPLETE AND VERIFIED.
- Candidate TypeScript/TSX syntax parse: COMPLETE AND VERIFIED — 69 files, zero parser syntax diagnostics.
- Static test declarations: 16 test files, 155 declared test cases; this is a count, not an execution result.
- Full candidate `npm run lint`, `npm test`, `npm run audit`, and `npm run build`: not run in this environment because dependencies are not installed and package registry access is not available here.
- Browser, responsive, keyboard, screen-reader and live-provider testing: not performed.
- GitHub upload, Render deployment, Atlas migration and Netlify deployment: not performed.

The user's Mac-reported 153 passing tests and other checks refer to the Post-Review baseline before the two new demo-specific test cases and this continuation's code/UI/workflow changes. Rerun all four checks on this candidate before publishing.

## Product limitations remain

No real reviewed opportunity ingestion, independent claim-level source engine, PDF/DOCX extraction, OCR, provider inference test, or CV PDF visual inspection was added. Keep the public catalogue empty rather than inventing opportunities. This candidate must not accept real student records.
