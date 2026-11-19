# ProofPath AI 4.0 — Read-Only Free Demo Deployment Guide

**Status:** Candidate-only. No new repository or Render service was created by this run.
**Target:** public UI preview only; no real student records and no durable user data.

## 1. Before deployment

From the extracted candidate root, on the Mac with the project Node version (the user reports Node.js `v24.21.0`):

```bash
npm ci --include=dev
npm run lint
npm test
npm run audit
npm run build
```

Do not deploy unless all four checks pass on the exact candidate folder. Review the resulting test count and any audit findings. Do not use `npm audit fix --force` as a shortcut.

The current continuation environment completed a TypeScript/TSX syntax parse (69 files, zero syntax diagnostics), but did not run the actual project typecheck, test runner, npm audit or Vite build.

## 2. Create a new private GitHub repository

The connected GitHub integration can inspect repositories and create files/commits/branches, but in this session it does not provide a create-repository action or a way to upload the local ZIP's binary assets and all files as one repository. The existing `proofpath-ai` repository is public and its `main` branch is already connected to the live Render service. Do not push this candidate to that `main`.

Create a new empty **private** GitHub repository named `proofpath-ai-free-demo` using GitHub's website. Then, from this candidate folder:

```bash
git init -b deploy/proofpath-ai-free-demo
git add .
git status --short
# Confirm that .env, databases, node_modules, dist and personal data are not staged.
git commit -m "chore: prepare read-only ProofPath AI demo"
git remote add origin https://github.com/<your-account>/proofpath-ai-free-demo.git
git push -u origin deploy/proofpath-ai-free-demo
```

Do not add a real `.env`, any SQLite DB, API key, OpenJarvis credential, student information or build output. `.gitignore` already excludes the common sensitive/runtime paths. `package-lock.json` is the npm lockfile used by the supplied CI/deployment instructions; keep it as the authoritative lockfile for this deployment.

After the first push, enable repository Actions. The candidate CI workflow now runs on `main` and `deploy/**` pushes/PRs and performs lint, tests, npm audit and build. Do not change the existing public `proofpath-ai` repository or merge its existing open PR #6 as part of this deployment.

## 3. Create a separate Render Web Service

Only after the private repository is populated and CI passes:

- In Render, choose **New → Web Service** and select the new private repository.
- Name: `proofpath-ai-free-demo` (or another unused name).
- Runtime: Node.
- Branch: `deploy/proofpath-ai-free-demo`.
- Region: Singapore is a reasonable first choice for the existing account's current service, but confirm current data residency/latency needs.
- Plan: Free only.
- Build command:

```bash
npm ci --include=dev && npm run lint && npm test && npm run audit && npm run build
```

- Start command: `npm start`.
- Health check path: `/api/health`.
- Leave scaling at one instance. Do not attach paid persistent disks or paid databases.

The current Render MCP create-service operation does not expose the health-check-path field, and no separate `render.yaml` was attached. Configure the health check in the Dashboard. Do not create or modify the existing `proofpath-ai-demo` service. The existing service points to the public repository's `main` branch and auto-deploys on commit.

## 4. Required environment configuration

Set the following on the **new** service only. Use Render's environment variable UI/secret manager. Generate a fresh `SESSION_SECRET` there; never paste a real secret into chat or source code.

| Key | Value / handling |
|---|---|
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `true` |
| `VITE_DEMO_MODE` | `true` — required during the build so the frontend is compiled read-only |
| `DB_PATH` | `/tmp/proofpath-demo.db` — absolute, ephemeral, disposable; not durable storage |
| `SESSION_SECRET` | Fresh random value of at least 32 characters, stored as a secret |
| `AI_ENABLED` | `false` |
| `AI_FREE_TIER_CONFIRMED` | `false` |
| `AI_STUDENT_AUDIENCE_APPROVED` | `false` |
| `AI_GLOBAL_DAILY_LIMIT` | `0` |
| `OLLAMA_ENABLED` | `false` |
| `GEMINI_API_KEY` | Leave unset |
| `OPENJARVIS_BASE_URL` | Leave unset |
| `OPENJARVIS_API_KEY` | Leave unset |
| `MONGODB_URI` | Leave unset |

The production server requires a strong session secret and an absolute database path even though demo mode skips account sessions. The `/tmp` path is suitable only because all state-changing APIs are blocked and the demo must not hold data. The database will be lost on restart/redeploy. An absolute path does not make storage durable.

## 5. Free-tier and spending boundary

Do not upgrade a plan, add a disk, add a paid database, enable autoscaling or add paid add-ons. Render's service inventory showed the existing service on Free, but the connected tools did not expose account billing/egress hard caps or current overage protections. Confirm billing and any bandwidth/usage overage behavior in the Dashboard before making the candidate public. If a hard spending boundary cannot be established, keep it local or staging-only.

Free service sleep/wake delays and ephemeral storage must be disclosed on the public page or project README. This is not a production architecture.

## 6. First deployment smoke checks

After the separate service deploys:

1. Confirm build logs show all quality commands passed.
2. Confirm the service is Live.
3. Request `https://<new-service>.onrender.com/api/health`; require HTTP 200, `database: connected`, and `demoMode: true`.
4. Open `/` and confirm the demo banner is visible.
5. Open `/login`, `/register`, `/forgot-password`, and `/dashboard`; verify that no account form or dashboard appears.
6. Open `/opportunities`; confirm the empty state, unless a real opportunity has completed the reviewed publication workflow.
7. Open `/verify`; confirm the warning is visible, file picker and submit actions are disabled.
8. Send direct POST, PUT, PATCH and DELETE requests to representative `/api` paths; each must return HTTP 403 with `DEMO_READ_ONLY`.
9. Check that Gemini, Ollama and OpenJarvis are not shown as connected.
10. Review logs for secrets, request bodies or personal information. Do not use actual student details for tests.
11. Inspect mobile, keyboard-only navigation, reduced-motion and screen-reader behavior.
12. Generate short and multi-page CV PDFs only in a local synthetic test account; visually inspect them before claiming export quality. CV Studio is behind protected account routes in the public demo.

A successful Render build alone is not proof of public reachability. Do not publish a URL as verified until these checks actually pass.

## 7. Scheduled opportunity monitoring

The monitor workflow no longer hardcodes the existing live service URL. It reads `MONITOR_URL` from a GitHub repository variable and skips when either that value or `MONITORING_CRON_SECRET` is absent. It requires an HTTPS URL.

Do **not** configure those values for the read-only public demo: the demo intentionally rejects all POST requests, including the internal monitoring trigger. The scheduled workflow should therefore skip. Configure it only later for a separate service whose monitoring write endpoint and authentication have been specifically reviewed.

## 8. Architecture decisions

- **Render:** primary single-origin full-stack host, only after a separate service is configured.
- **MongoDB Atlas:** not used in this release. The current SQLite data layer is synchronous and relational; Atlas access list currently contains a broad `0.0.0.0/0` rule and exact safe Render egress IPs were not obtained.
- **Netlify:** not used. No ProofPath-named site was found, and a second origin would add cookie/CORS/CSRF complexity.
- **AI:** deterministic Guided Mode only. No hosted model endpoint is configured.
- **Student records:** must not be collected. Demo write APIs are blocked.

## 9. Rollback

Because this will be a new Render service and new private repository, rollback should be limited to disabling or deleting the new demo service after reviewing its state. Do not touch the existing `proofpath-ai-demo` service or the public source repository. No existing database or records should be part of this demo.
