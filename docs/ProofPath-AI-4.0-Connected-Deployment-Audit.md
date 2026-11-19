# ProofPath AI 4.0 — Connected Free Demo Candidate Audit

**Audit date:** 2026-11-19
**Candidate decision:** Suitable for continued local validation and controlled demo preparation; **not deployed and not production-ready for real student records**.
**Scope:** Uploaded Post-Review source ZIP, supplied review/hardening reports, the candidate modifications listed below, and read-only inspection of connected GitHub, Render, MongoDB Atlas and Netlify resources.

## 1. Executive decision

A new local candidate copy was created from the uploaded `ProofPath-AI-4.0-Post-Review-Fixes (2).zip`. The uploaded archive was not changed. The candidate preserves the reviewed SQLite/Express/React application and its opportunity publication/database path hardening. It adds a fail-closed public demo mode:

- Server-side middleware rejects every non-GET/HEAD/OPTIONS `/api` request with HTTP 403 and `DEMO_READ_ONLY`. Production is read-only by default unless the operator explicitly sets `DEMO_MODE=false`.
- Session lookup is skipped in public demo mode.
- Login/register/forgot-password/contact pages are replaced with a read-only demo access screen. The public Pathfinder remains available as a deterministic, in-tab, no-model guide and does not save selections.
- A persistent public notice warns visitors not to provide personal information.
- Verification submission, PDF/image file selection, and community-report submission controls are disabled in the public demo UI.
- Ollama has a server-side `OLLAMA_ENABLED` switch; set it to `false` for hosted demo deployments.
- Health output exposes a boolean `demoMode` status.
- README wording no longer presents this un-deployed candidate as the code currently served by the existing Render deployment.

**No source was pushed to GitHub. No Render deployment or service creation occurred. No MongoDB database/user/allowlist/cluster was changed. No Netlify site was created or changed.** The existing `proofpath-ai-demo` service tracks the existing public repository's `main` branch; changing that service or that branch would be unsafe.

## 2. Source identity and reconciliation

### Uploaded source inspected

- File: `ProofPath-AI-4.0-Post-Review-Fixes (2).zip`
- SHA-256: `66ccd584eee6927a0a4ead48780f8bc13f2e4e672dca2b274b069c8557a490b2`
- Archive extraction: 119 ZIP entries and 94 regular files.
- Candidate began with the same 94-file source tree.
- `.git` metadata is absent in the ZIP. No archive branch, commit or historical diff can be asserted.
- The source includes `package.json`, `package-lock.json`, `bun.lock`, TypeScript source, tests, CI, `.env.example`, `.gitignore` and product documentation.
- No real `.env`, database file, `node_modules`, `dist`, `.git`, PEM/private-key file or local runtime database was present in the source archive.

### Missing named inputs

The current conversation supplied only the Post-Review ZIP and the two Markdown reports, plus the pasted master prompt. The following named items in that prompt were **not attached** and could not be compared:

- `ProofPath-AI-4.0-Free-Demo-Release.zip`
- Free-Demo Audit, Free Deployment Guide, Free Release Notes
- separate `render.yaml`
- Final-Audit-Updated and Deployment-Guide-Updated
- Experience Expansion archive and `Pasted markdown.md`

Therefore, no claims are made about merging a Free-Demo ZIP or reviewing a separate `render.yaml`. The new read-only protections were implemented directly on a fresh copy of the available Post-Review ZIP rather than by blindly replacing the app with an unavailable archive.

### Differences in the candidate source

The candidate retains all 94 original source/archive files; no application source files were removed. Twelve existing code/config/test/readme/workflow files were modified:

- `.env.example`
- `README.md`
- `.github/workflows/ci.yml`
- `.github/workflows/opportunity-monitor.yml`
- `server/app.ts`
- `server/assistant-providers.ts`
- `src/App.tsx`
- `src/components/Layout.tsx`
- `src/pages/PublicPages.tsx`
- `src/pages/VerificationWorkspace.tsx`
- `tests/api.test.ts`
- `tests/assistant-providers.test.ts`

The baseline `ProofPath-AI-4.0-Release-Notes.md` and `ProofPath-AI-4.0-Deployment-Guide.md` were updated in the candidate. Two new reports were added: this connected deployment audit and the MongoDB migration assessment. The original uploaded ZIP remains unchanged.

## 3. Source-level acceptance review

| Area | Status | Finding |
|---|---|---|
| Post-Review opportunity draft creation | COMPLETE AND VERIFIED | Create path writes `UNVERIFIED` and `is_published = 0`; create input does not let the caller claim a verified status. |
| Admin draft review queue | COMPLETE AND VERIFIED | Reviewer/admin-protected endpoint exists; drafts are not in the public published catalogue. |
| Explicit publish gate | COMPLETE AND VERIFIED | Publish action requires `VERIFIED` and a review note of at least 10 characters; note is audited. |
| Automatic unpublish on status downgrade | COMPLETE AND VERIFIED | Published record is unpublished when its status changes away from `VERIFIED`. |
| Production `DB_PATH` fail-closed rule | COMPLETE AND VERIFIED | Production requires an explicit absolute path and rejects missing, relative and in-memory paths. Hosting durability still requires a staging proof. |
| CI dependency audit command | COMPLETE AND VERIFIED | `npm run audit` invokes `npm audit --audit-level=high` and CI contains an audit step. |
| Public demo API write block | IMPLEMENTED — LIVE TEST PENDING | Candidate blocks all non-read API methods centrally before route handlers. One integration test checks registration, upload, PUT, PATCH and DELETE attempts. |
| Demo account UI lockout | IMPLEMENTED — LIVE TEST PENDING | Public demo routes replace login/register/forgot-password screens; backend skips session hydration and rejects API writes. |
| Public no-model experience | IMPLEMENTED — LIVE TEST PENDING | Public Pathfinder is a deterministic in-tab guide; the source states its selections are temporary/not saved and it does not run an AI request. It reads public catalogue filters only. |
| Public personal-data notice | IMPLEMENTED — LIVE TEST PENDING | Visible public banner and verification-form warning added. |
| Hosted Ollama disable switch | IMPLEMENTED — LIVE TEST PENDING | Set `OLLAMA_ENABLED=false`; explicit status text reports operator disablement. |
| Gemini | COMPLETE AND VERIFIED | Existing default-off AI, free-tier, student-audience and quota gates are preserved. Keep all gates off. |
| OpenJarvis | IMPLEMENTED — LIVE TEST PENDING | Hosted configuration should leave URL/key unset; local loopback adapter remains available in local development only. |
| Real opportunity records | NOT IMPLEMENTED | No reviewed live opportunity data was found or imported. Catalogue should remain empty. |
| Independent claim-level source retrieval | NOT IMPLEMENTED | URL reachability is not independent verification. Keep `INSUFFICIENT_EVIDENCE` where appropriate. |
| PDF/DOCX text extraction and OCR | NOT IMPLEMENTED | Upload validation is not document analysis. Public demo disables upload submission. |
| CV PDF visual inspection | IMPLEMENTED — LIVE TEST PENDING | Existing editor/export implementation remains; no fresh visual export inspection was run. |
| Durable production database/backup/restore | BLOCKED BY EXTERNAL DEPENDENCY | Free Render filesystem is ephemeral; no durable storage or backup restore exercise was performed. |
| Full browser/accessibility/mobile matrix | PARTIALLY IMPLEMENTED | No browser automation or mobile, keyboard-only, screen-reader or reduced-motion pass was run during this continuation. |

## 4. Connected infrastructure inventory

### GitHub

- Authenticated GitHub login: `fahim1252375-maker`.
- Existing repository: [`fahim1252375-maker/proofpath-ai`](https://github.com/fahim1252375-maker/proofpath-ai).
- Visibility: public; default branch: `main`; the connected account has admin/push permissions.
- Main commit observed: `d753671fa70e853825b331603df5b6c11d1c21b4` (`ci: allow manual quality-check runs`).
- An existing open PR #6, [`Harden ProofPath production readiness`](https://github.com/fahim1252375-maker/proofpath-ai/pull/6), remains open and unmodified. It is not the uploaded Post-Review source candidate and should not be merged as a substitute for the current archive.
- The candidate CI workflow now runs on `main` and `deploy/**` pushes/PRs and retains audit, lint, test and build steps.
- The scheduled opportunity-monitor workflow no longer hardcodes the existing live service URL. It requires an explicit HTTPS `MONITOR_URL` repository variable and the secret; it skips if either is missing. Do not configure it for the read-only demo because its POST endpoint is blocked.
- The uploaded source differs from the remote repository's older `main` snapshot (for example, package metadata is `proofpath-ai` in the uploaded archive vs `react-example` in the fetched remote `main` package file).
- The GitHub connector exposes branch and file/commit operations but no repository-creation action or bulk binary-archive upload from this workspace. It cannot safely publish this 94-file source tree as a new private repository. No empty branch was created and no remote branch was changed.

**Decision:** keep the current public repository and `main` untouched. Create a new private repository locally/manually, then push the candidate branch using the commands in the Deployment Guide.

### Render

- One connected workspace was found.
- Existing service: `proofpath-ai-demo`.
- Type: Node web service; plan: Free; region: Singapore.
- Repository/branch: `fahim1252375-maker/proofpath-ai`, `main`.
- Auto deploy: enabled on commits.
- Existing service URL: `https://proofpath-ai-demo.onrender.com`.
- The last observed deployment was live and associated with the existing `main` commit above. Build/deploy events reported success.
- The existing service has no configured health-check path in the returned metadata. Recent logs show normal app GET traffic; one logged `POST /api/verify/file` returned 503 on 2026-11-18. The exact cause was not established from the log line alone.
- The Render connector does not expose an environment-variable-name-only inspection operation in this session; no values were requested or displayed.
- No new Render service was created. Existing services were not changed.

**Decision:** do not repoint or update the existing service. Create a separate Free Web Service only after the candidate is pushed to a new private repository and all local/CI checks pass. Configure `/api/health` as its health check in the dashboard.

### MongoDB Atlas

- One organization/project and one `Cluster0` were found.
- Cluster: FREE, AWS `AP_SOUTH_1`, MongoDB `8.0.37`, state `IDLE`.
- Existing databases: `accesspath`, `blogspace`, `sample_mflix`, `admin`, `local`; no ProofPath database was found.
- Existing DB users belong to other application namespaces; no ProofPath-scoped user was found.
- Atlas project access list currently includes `0.0.0.0/0` (“Render deployment access”). This is a broad allow-from-anywhere rule, not an acceptable least-privilege configuration for this application.
- The connected Render inventory did not provide the exact outbound IP ranges required to replace that range safely.
- A read-only Atlas connection was used only to list databases. No cluster, database, collection, user, role, index or access-list change occurred.

**Decision:** do not migrate this code to MongoDB or attach the existing broad database user. Keep SQLite for the public demo, use a fresh ephemeral database path, and block writes. MongoDB migration remains a separate project requiring a real repository abstraction and secure Atlas network policy.

### Netlify

- The connected Netlify account/team is on the Free plan.
- Search for a ProofPath-named Netlify project returned no matching project.
- Many unrelated Netlify sites are present; none were modified.
- The current app is a same-origin React/Vite + Express application. Splitting it across Netlify and Render would add CORS, cookie/SameSite, CSRF and session complexity without a demonstrated need.

**Decision:** Netlify is not used for this release. Keep the full application on one Render origin.

## 5. Cost and release safety

No paid resource, paid upgrade, disk, database, static IP, billing change or add-on was created. The account billing page/overage cap was not exposed by the available connector, so a reliable hard spending boundary could not be independently confirmed. Render Free has ephemeral storage and may sleep; this makes it appropriate only for a limited public UI preview with no user-data storage, not real student records. Verify account billing/egress limits in the Render Dashboard before enabling a public URL.

## 6. Verification performed during this continuation

| Check | Result |
|---|---|
| Input ZIP integrity | COMPLETE AND VERIFIED — archive extracted and its source tree inspected. |
| Input SHA-256 | COMPLETE AND VERIFIED — `66ccd584eee6927a0a4ead48780f8bc13f2e4e672dca2b274b069c8557a490b2`. |
| Candidate file inventory | COMPLETE AND VERIFIED — 94 original files retained; 10 source/config/test files modified; no source files removed. |
| Secret/runtime artifact filename scan | COMPLETE AND VERIFIED — no `.env`, DB, `node_modules`, `dist`, `.git`, PEM/key or runtime DB included in candidate. |
| Hard-coded-secret pattern scan | PARTIALLY IMPLEMENTED — matches were limited to `.env.example` placeholders and test-only fake credentials; no production credential was copied into the candidate. |
| TypeScript/TSX syntax parse | COMPLETE AND VERIFIED — 69 files parsed with 0 syntax diagnostics using the installed TypeScript parser; both edited GitHub Actions workflow YAML files also parsed successfully. This is syntax parsing only, not project typechecking. |
| Static test declaration count | COMPLETE AND VERIFIED — 16 test files and 155 statically declared `it`/`test` cases. This does not mean those tests ran. |
| `npm run lint` | BLOCKED BY EXTERNAL DEPENDENCY — not rerun here; candidate has no `node_modules`. |
| `npm test` | BLOCKED BY EXTERNAL DEPENDENCY — not rerun here; no dependencies installed in this environment. |
| `npm run audit` | BLOCKED BY EXTERNAL DEPENDENCY — not rerun here. |
| `npm run build` | BLOCKED BY EXTERNAL DEPENDENCY — not rerun here. |
| Browser/mobile live validation | NOT IMPLEMENTED in this pass — no browser automation tool available in this environment. |
| Public URL reachability of candidate | BLOCKED BY EXTERNAL DEPENDENCY — candidate was not deployed. |

The user's latest local Mac validation (153 tests, lint, audit and build passed on their Post-Review baseline) is recorded as **user-reported**. The two new test cases and the demo UI/server changes in this candidate have not been executed by this continuation. Rerun the commands in the Deployment Guide from the candidate directory before publishing.

## 7. Current release blockers

1. The Free-Demo ZIP and separate `render.yaml` referenced in the master prompt were not attached, so selective merge and Blueprint reconciliation were not possible.
2. The GitHub connector cannot create a new repository or upload this local 94-file source archive as a whole. A local Git push to a new private repository is required.
3. Render's current `proofpath-ai-demo` service points at `main`; the candidate has not been deployed. Existing service cannot be repointed without violating the no-overwrite constraint.
4. Render account billing/egress hard-cap controls and environment variable names could not be inspected by the connector.
5. Post-candidate lint, tests, dependency audit and build are pending.
6. Full UI journey, mobile, keyboard, screen-reader, reduced-motion, console and CV PDF inspection are pending.
7. MongoDB migration remains intentionally out of scope because no DB abstraction or network allowlist was implemented, and the Atlas project includes a broad `0.0.0.0/0` rule.
8. No real official-source opportunity ingestion, independent claim evidence or PDF/DOCX/OCR extraction exists.
9. Production durable storage, encrypted off-host backups and a restore rehearsal are not configured.

**Final release decision:** this package is a read-only demo candidate for local validation and a later controlled staging deployment. It is not a deployed/connected release and is not approved for real student information or public opportunity intelligence claims.
