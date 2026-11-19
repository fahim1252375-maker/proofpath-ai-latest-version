# ProofPath AI 4.0 — Post-Review Hardening Report

**Date:** 2026-11-19
**Base:** `ProofPath-AI-4.0-Final-Production.zip`
**Result:** Two P0 source-level issues and a CI audit gap were corrected in a safe working copy. The original uploaded archive was left unchanged.

## Changes made

### 1. Opportunity publication safety

- New admin-created opportunities are always stored as `UNVERIFIED` and `is_published = 0`.
- The create endpoint ignores/rejects any attempt to set the initial verification status and accepts HTTPS source URLs only.
- Added `GET /api/admin/opportunities`, protected for admin/moderator roles, so draft records are visible to reviewers without appearing in the public catalogue.
- Added a Draft/Published state and explicit publish/unpublish control to the Admin panel.
- Publishing requires the record to be `VERIFIED` and a review note with at least 10 characters.
- Publication notes are retained in the admin audit log.
- A record that changes from `VERIFIED` to another status is automatically unpublished.
- Changing a draft to `VERIFIED` does not publish it by itself; an explicit publish action is still required.

This remains a human-review gate. It is not a replacement for independent source retrieval or a claim-level evidence engine. Existing production database rows are not automatically rewritten; audit them before launch:

```sql
SELECT id, title, verification_status
FROM opportunities
WHERE is_published = 1 AND verification_status <> 'VERIFIED';
```

### 2. Production database path safety

- Production startup now requires an explicit `DB_PATH`.
- `DB_PATH` must be an absolute filesystem path; empty, relative, and `:memory:` paths fail closed.
- Both startup security validation and `initDatabase` enforce the rule.
- This cannot prove that the configured path is backed by a durable host volume. Verify the actual mount and persistence with a staging restart/restore rehearsal.

### 3. CI dependency audit

- Added `npm run audit` mapped to `npm audit --audit-level=high`.
- Added the audit step to `.github/workflows/ci.yml`.

### 4. Documentation

- Updated README, Final Audit, Release Notes, and Deployment Guide to describe the new controls.
- Documented that the current in-memory rate limiter requires a single application instance.
- Clarified that `APP_URL` is not currently runtime-validated.
- Clarified that `scripts/backup-sqlite.ts` creates a consistent backup but does not encrypt it.

## Files changed

- `server/app.ts`
- `server/db.ts`
- `server/security.ts`
- `src/pages/AdminPanel.tsx`
- `tests/api.test.ts`
- `tests/security.test.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `.env.example`
- `README.md`
- `docs/ProofPath-AI-4.0-Final-Audit.md`
- `docs/ProofPath-AI-4.0-Release-Notes.md`
- `docs/ProofPath-AI-4.0-Deployment-Guide.md`
- `docs/ProofPath-AI-4.0-Post-Review-Fixes.md`

## Verification performed here

- Original ZIP integrity was rechecked before editing.
- TypeScript/TSX syntax parsing: 66 source/test files parsed with 0 syntax diagnostics.
- Static test declarations: 153 after adding one production DB-path test (the prior release audit's 152 passing tests belong to the unmodified base archive).
- Attempted `npm ci --include=dev`, but package installation timed out while accessing the package registry. The global TypeScript compiler could not perform project type-checking because `vite/client` type definitions were not installed.
- Therefore post-review `npm run lint`, `npm test`, `npm run build`, and `npm run audit` are **not verified**. They must be rerun on the user's Mac or connected CI before deployment.

## Still not implemented / not validated

- Real reviewed opportunity data ingestion and publication from primary sources.
- Independent multi-source retrieval and claim-level evidence.
- PDF/DOCX text extraction or OCR.
- Live authenticated Ollama/OpenJarvis inference.
- Gemini enablement (keep disabled pending policy-compatible audience review).
- Manual short and multi-page CV PDF inspection.
- Complete signed-in browser, mobile, keyboard, reduced-motion, and screen-reader checks.
- Durable hosting, production secrets, off-host encrypted backup, restore rehearsal, and deployment.

## Local validation commands

Run from the extracted project root:

```bash
npm ci --include=dev
npm run lint
npm test
npm run audit
npm run build
```

For local development, keep `NODE_ENV=development` and the relative `DB_PATH` in `.env.example`. For production, set `NODE_ENV=production`, use a strong `SESSION_SECRET`, and set `DB_PATH` to an absolute path under the actual persistent-volume mount.
