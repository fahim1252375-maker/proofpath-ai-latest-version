/**
 * Comparison Studio — pure mapping for the /compare page. No DOM, no fetches.
 *
 * Rules (owner decisions, Stage 5):
 *  - Selection must hold at least 2 and at most 4 records; violations return
 *    explicit errors, never a silent trim.
 *  - Every cell carries its value, the source field it came from, and the
 *    record id it belongs to.
 *  - A missing value is the literal "Not provided" — never guessed, never zero.
 */

export interface CompareOpportunity {
  id: string;
  title: string;
  verificationStatus: string;
  eligibility?: { status: string } | null;
  fundingType: string;
  fundingAmount: string;
  deadline: string;
  deadlineUrgency?: string;
  minGpa: number | null;
  englishReq: string;
  educationLevel: string;
  eligibleNationalities: string[];
  minAge: number | null;
  maxAge: number | null;
  officialUrl: string;
  lastVerifiedAt: string;
}

export interface CompareCell {
  value: string;
  /** Always "GET /api/opportunities/compare → <response field>". */
  source: string;
  recordId: string;
}

export interface CompareRow {
  criterion: string;
  cells: CompareCell[];
}

export type NormalizeResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: 'too_few' | 'too_many'; received: number };

export const NOT_PROVIDED = 'Not provided';

const ENDPOINT = 'GET /api/opportunities/compare';

/** Deduplicates while preserving order; rejects fewer than 2 or more than 4. */
export function normalizeCompareSelection(ids: readonly string[]): NormalizeResult {
  const unique: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && id.trim() !== '' && !unique.includes(id)) unique.push(id);
  }
  if (unique.length < 2) return { ok: false, error: 'too_few', received: unique.length };
  if (unique.length > 4) return { ok: false, error: 'too_many', received: unique.length };
  return { ok: true, ids: unique };
}

function cell(record: CompareOpportunity, field: string, raw: string | null | undefined): CompareCell {
  const value = raw === null || raw === undefined || String(raw).trim() === '' ? NOT_PROVIDED : String(raw);
  return { value, source: `${ENDPOINT} → ${field}`, recordId: record.id };
}

function readableEnum(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

function ageLabel(value: number | null): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function buildComparisonRows(opportunities: readonly CompareOpportunity[]): CompareRow[] {
  if (opportunities.length === 0) return [];
  const rows: CompareRow[] = [];

  rows.push({
    criterion: 'Verification',
    cells: opportunities.map((o) => cell(o, 'verificationStatus', readableEnum(o.verificationStatus || ''))),
  });

  rows.push({
    criterion: 'Your eligibility',
    cells: opportunities.map((o) => {
      const status = o.eligibility?.status;
      let value = NOT_PROVIDED;
      if (status === 'ELIGIBLE') value = 'Eligible';
      else if (status === 'POTENTIALLY_ELIGIBLE') value = 'Needs more information';
      else if (status === 'NOT_ELIGIBLE') value = 'Not eligible';
      else if (status === 'MISSING_INFO') value = 'Not evaluated yet';
      return { value, source: `${ENDPOINT} → eligibility.status`, recordId: o.id };
    }),
  });

  rows.push({
    criterion: 'Funding type',
    cells: opportunities.map((o) => cell(o, 'fundingType', readableEnum(o.fundingType || ''))),
  });

  rows.push({
    criterion: 'Funding amount',
    cells: opportunities.map((o) => cell(o, 'fundingAmount', o.fundingAmount)),
  });

  rows.push({
    criterion: 'Deadline',
    cells: opportunities.map((o) =>
      cell(
        o,
        'deadline',
        o.deadline
          ? o.deadlineUrgency
            ? `${o.deadline} · ${o.deadlineUrgency}`
            : o.deadline
          : null
      )
    ),
  });

  rows.push({
    criterion: 'Minimum GPA',
    cells: opportunities.map((o) =>
      cell(o, 'minGpa', o.minGpa === null || o.minGpa === undefined ? null : `${o.minGpa.toFixed(2)} / 4.0`)
    ),
  });

  rows.push({
    criterion: 'English requirement',
    cells: opportunities.map((o) => cell(o, 'englishReq', o.englishReq)),
  });

  rows.push({
    criterion: 'Education level',
    cells: opportunities.map((o) => cell(o, 'educationLevel', readableEnum(o.educationLevel || ''))),
  });

  rows.push({
    criterion: 'Eligible nationalities',
    cells: opportunities.map((o) =>
      cell(o, 'eligibleNationalities', (o.eligibleNationalities ?? []).length > 0 ? o.eligibleNationalities.join(', ') : null)
    ),
  });

  rows.push({
    criterion: 'Minimum age',
    cells: opportunities.map((o) => cell(o, 'minAge', ageLabel(o.minAge ?? null))),
  });

  rows.push({
    criterion: 'Maximum age',
    cells: opportunities.map((o) => cell(o, 'maxAge', ageLabel(o.maxAge ?? null))),
  });

  rows.push({
    criterion: 'Official source',
    cells: opportunities.map((o) => cell(o, 'officialUrl', o.officialUrl)),
  });

  rows.push({
    criterion: 'Last verified',
    cells: opportunities.map((o) => cell(o, 'lastVerifiedAt', o.lastVerifiedAt)),
  });

  return rows;
}
