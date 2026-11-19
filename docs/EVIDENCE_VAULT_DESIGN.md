# Evidence Vault — Design Proposal (Stage 7)

**Status:** proposal only. Nothing in this document has been implemented. No migration has been written, no server code changed, no dependency added. Implementation requires the owner's written approval of the decisions in this document.

---

## 1. Current state (audited from the code, quoted)

**What the schema offers today** — `server/db.ts`, migration 1 (`initial_enterprise_schema`), lines 190–199:

```sql
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
```

**Every route that touches `application_documents` (all in `server/app.ts`):**

| Line | Route / query | What it does with `file_path` |
|---|---|---|
| 1291 | `GET /api/applications` (document subquery) | reads rows; selects `*` but `file_path` is always NULL, so nothing is exposed |
| 1506 | `POST /api/applications/:id/documents` | inserts `id, application_id, user_id, doc_name, doc_type, is_ready, notes, updated_at` — **`file_path` is not in the column list** |
| 1532 | `PATCH /api/applications/:id/documents/:docId` | ownership check (`id AND application_id AND user_id`), then updates `is_ready`, `notes` only |
| 1548 | `DELETE /api/applications/:id/documents/:docId` | deletes the row |

**`file_path` is never populated. No upload is stored on disk anywhere.** The only file-upload route in the app is `POST /api/verify/file` (app.ts:1132), which uses `multer.memoryStorage()` (app.ts:70–76), validates the bytes, runs the local no-cost check, and **discards the buffer**. The verification engine deliberately persists `file_name: NULL, file_mime: NULL` (`server/ai.ts:262–275`) and states in the report: *"The file bytes were not sent to Gemini and are not stored in the verification report."*

**Current upload validation (reused rules; `server/security.ts:58` and `server/app.ts:70–84`):**
- Multer: `memoryStorage()`, `limits: { fileSize: 10 * 1024 * 1024, files: 1 }` (10 MB, one file).
- MIME allowlist: `application/pdf`, `image/png`, `image/jpeg`, `image/webp` (checked against the declared mimetype, app.ts:1181).
- Binary magic-byte verification per type (`%PDF`, `\x89PNG`, `\xFF\xD8\xFF` JPEG, `RIFF…WEBP`), `server/security.ts:58–81`.
- State-changing requests require session cookie + CSRF token; routes are auth-scoped.

**Storage clients in `package.json`: none.** No S3, GCS, Azure Blob, MinIO, or similar SDK exists. The stack is Express + better-sqlite3 + multer (memory storage).

**Storage configuration that exists today** (quoted):
- `.env.example:24–27`: `# DB_PATH: File path for persistent SQLite storage (defaults to ./data/proofpath.db). # On Render with a paid persistent disk mounted at /var/data/proofpath, use: # DB_PATH="/var/data/proofpath/proofpath.db"` — there is **no** upload-directory or object-store setting.
- `README.md:119`: *"The connected Render service is currently on the Free plan and uses the application's SQLite file under `./data`. A free service without a persistent disk can lose local database contents during restarts or redeployments."*

**Honest conclusion:** `application_documents.file_path` is a nullable placeholder that no code writes. It is **not** a secure store — there is no file storage of any kind behind it today. The Evidence Vault does not exist; this document proposes how to build it.

---

## 2. Goal

A secure, private, per-user document store for application materials (transcripts, passports/IDs, statements, recommendation letters):

- Every file is owned by exactly one user; no other account, no anonymous visitor, and no public URL can read it.
- Every read performs a per-user ownership check server-side; downloads happen only through an authenticated endpoint — never a direct file path, never a public bucket URL.
- Files are encrypted at rest; transport is HTTPS-only (already the case for the app).
- Uploads reuse the existing validation rules; nothing new is trusted by default.
- Deletion is real: user-triggered deletes remove the bytes, and account deletion removes every file the account owned.
- No personal document data ever reaches Gemini or any third-party AI service — this stays true; the vault is storage only.

---

## 3. Storage options compared

### Option A — Encrypted files on the app's own persistent disk

- **Where it lives:** on a mounted persistent disk next to the SQLite database (e.g., Render disk at `/var/data/proofpath/vault/`), files encrypted with a per-file data key wrapped by a master key held outside the repo.
- **Cost driver:** disk size only (Render persistent disk pricing, roughly $0.25/GB/month tier — confirm current pricing at purchase time). 10 MB cap × realistic document counts keeps this small.
- **Operational burden:** lowest — no new vendor, no new SDK (Node's `fs` + `node:crypto` suffice), backups piggyback on the existing `scripts/backup-sqlite.ts`-style routine plus file sync.
- **Risk:** single-server coupling: disk loss = file loss without off-site backup; horizontal scaling impossible (fine for this app, which is single-instance by design); the operator must actually provision and back up the disk.

### Option B — External object store with a private bucket (S3 / GCS / Cloudflare R2)

- **Where it lives:** a private bucket (block public access on), server-side encryption enabled, optionally with a customer-managed key.
- **Cost driver:** storage GB-month + request/class charges; R2 has no egress fees; S3/GCS bill egress. Still small at this scale.
- **Operational burden:** medium — new dependency (an SDK), new credentials to manage and rotate, bucket policy to harden, lifecycle rules to configure; mitigates the single-server risk and survives app redeploys/reinstalls independently.
- **Risk:** credential leakage (mitigated by least-privilege, server-side-only keys); misconfigured bucket policy is the classic breach vector, so public access must be verifiably blocked; another vendor account and bill.

### Option C (rejected) — BLOBs inside SQLite

Store encrypted bytes in a BLOB column. Simplest possible ops (one file, one backup), but bloats the database file, slows every backup/vacuum, and couples document growth to DB health. Rejected on those grounds; noted for completeness.

---

## 4. Recommendation

**Option B (private object store, e.g., Cloudflare R2 or S3 with block-public-access + SSE), with Option A as the fallback if the owner refuses another vendor.**

Reasons: the app already accepts that its free-tier host can lose data (`README.md:119`) — putting irreplaceable identity documents on the same volatile disk makes a bad situation worse; an external private bucket survives host changes, keeps the 10 MB files cheap, and its server-side encryption + block-public-access defaults are auditable by the provider rather than hand-rolled. If the owner prefers zero new vendors, Option A is acceptable **only** with a real persistent disk plus scheduled encrypted off-site backups.

---

## 5. Encryption

- **In transit:** HTTPS everywhere (already enforced by the deployment); uploads/downloads go through the app's authenticated endpoints; object-store access happens server-to-server over TLS.
- **At rest:**
  - Option B: provider server-side encryption (SSE-S3/SSE-GCS default keys) at minimum; preferably a customer-managed key (SSE-KMS or R2 equivalent) so the owner can revoke access independently of the bucket.
  - Option A: client-side envelope encryption in the app — a random per-file data-encryption key (DEK) encrypts the bytes (`AES-256-GCM` via `node:crypto`, already a dependency-free path); the DEK is wrapped by a master key and both are stored in the DB row alongside the ciphertext.
- **Key custody (no keys are invented here):** the master key must be provided by the owner — from a KMS (preferred: cloud-managed, never exportable) or, for Option A, an environment secret of ≥32 random characters held in the platform's secret store, **never** in the repo, never in `.env.example`, rotated on a schedule the owner defines. The application holds it only in process memory. Loss of the master key = permanent loss of the files; a documented escrow/rotation procedure is part of the owner checklist.

---

## 6. Access control

- Every read: `requireAuth` + ownership check (`documents.user_id === session user.id`) before any byte moves, mirroring the existing pattern at `server/app.ts:1532` (`WHERE id = ? AND application_id = ? AND user_id = ?`).
- Downloads only through `GET /api/applications/:id/documents/:docId/file` (authenticated, CSRF-safe method choice per existing conventions). No public URLs, no direct paths, no bucket-public reads.
- Option B reads use short-lived server-generated download responses (the server fetches from the bucket and streams) rather than long-lived pre-signed URLs; if pre-signed URLs are ever used, TTL ≤ 60 s and single-object scope.
- Admins/moderators get **no** automatic access to student vault files; staff access would be a separate, logged, owner-approved decision (consistent with how verification reports are kept private per the privacy-first merge).

---

## 7. Upload validation

Reused verbatim from the existing rules: 10 MB limit, one file, MIME allowlist (PDF/PNG/JPEG/WEBP), magic-byte check (`server/security.ts:58`), `sanitizeText` on names, auth + CSRF. New requirements:

- Store the validated metadata (size, declared + verified MIME, SHA-256 of the ciphertext) on the document row for integrity checks.
- Enforce the magic-byte check *before* encryption (it runs on plaintext bytes).
- Optional filename sanitization for display only; the stored key must be a generated random ID (`doc_<uuid>` pattern already used), never user-supplied.
- Nothing about the file's contents is analyzed, extracted, or sent to any AI service — unchanged from the no-cost verification stance.

---

## 8. Retention and deletion

- **User-triggered:** deleting a document removes the object from storage and the row from `application_documents` (and records it in `admin_audit_logs`-style history only as a metadata event; the bytes themselves are unrecoverable after deletion — say so in the UI).
- **Account deletion:** because `application_documents` cascades on `users` (`ON DELETE CASCADE`), the rows disappear with the account; the vault layer must additionally delete every stored object for that user. A periodic reconciliation job (or a deletion queue) should verify orphaned objects are purged within a defined window (e.g., 30 days).
- **Backups:** deleted files may persist inside existing backups until the backup rotation expires — the retention window of backups (owner-defined) bounds this exposure and must be disclosed in the privacy documentation.

---

## 9. Versioning and expiry

- What the current schema supports: nothing versioned — one row per document, `updated_at` only, no history, no expiry.
- What would need a migration (named here only, **not written**): an additive migration (the next free number after 3, i.e., a hypothetical migration 4) adding e.g. `document_versions` (or `evidence_vault_objects`: object key, sha256, size, encrypted DEK, created_at, superseded_at) plus expiry/retention columns if the owner wants time-limited retention. It would be additive and idempotent per the project's migration rules and requires a separate written proposal before implementation.

---

## 10. Owner must provide

1. Decision: Option A (own encrypted disk) or Option B (private object store) — and, for B, the vendor (S3 / GCS / R2).
2. Infrastructure account: a cloud account with a private bucket (block-public-access verified) or a persistent disk mount, and where it attaches to the deployment.
3. Key management: a KMS key or a generated ≥32-char master secret, its storage location, rotation schedule, and escrow procedure.
4. Cost estimate source: the vendor's current pricing page / platform disk pricing, acknowledged in writing (this document deliberately does not quote numbers that change).
5. Retention policy: how long documents live, backup rotation, and the deletion-reconciliation window.
6. Written approval of this design before any code or migration is written.

## 11. Open questions for the owner

1. Should admins ever have break-glass access to student vault files (currently proposed: never, without a separate logged decision)?
2. Is per-file versioning (keeping superseded uploads) desired, or replace-on-upload?
3. Should downloads be rate-limited separately from `aiLimiter`, and logged per access?
4. Which jurisdiction/vendor constraints apply (data residency, student privacy law) for the chosen region?
5. What happens to vault contents when an application is deleted but the account remains — delete immediately, or keep until account deletion?
6. Confirm `application_documents.file_path` may be repurposed to store the vault object key (no schema change needed) or whether the owner prefers a new column via the future migration.
