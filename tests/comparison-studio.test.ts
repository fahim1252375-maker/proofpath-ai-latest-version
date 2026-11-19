import { describe, expect, it } from 'vitest';
import {
  buildComparisonRows,
  normalizeCompareSelection,
  NOT_PROVIDED,
  type CompareOpportunity,
} from '../src/lib/comparisonStudio.ts';

function opp(overrides: Partial<CompareOpportunity> = {}): CompareOpportunity {
  return {
    id: 'opp-1',
    title: 'Global STEM Fellowship',
    verificationStatus: 'VERIFIED',
    eligibility: { status: 'ELIGIBLE' },
    fundingType: 'fully_funded',
    fundingAmount: 'Full tuition + stipend',
    deadline: '2027-01-15',
    deadlineUrgency: 'Upcoming',
    minGpa: 3.5,
    englishReq: 'IELTS 6.5',
    educationLevel: 'masters',
    eligibleNationalities: ['All'],
    minAge: null,
    maxAge: null,
    officialUrl: 'https://example.org/fellowship',
    lastVerifiedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeCompareSelection limits', () => {
  it('rejects a single record with a too_few error', () => {
    const result = normalizeCompareSelection(['a']);
    expect(result).toEqual({ ok: false, error: 'too_few', received: 1 });
  });

  it('rejects five records with a too_many error', () => {
    const result = normalizeCompareSelection(['a', 'b', 'c', 'd', 'e']);
    expect(result).toEqual({ ok: false, error: 'too_many', received: 5 });
  });

  it('accepts two, three, and four records', () => {
    expect(normalizeCompareSelection(['a', 'b'])).toEqual({ ok: true, ids: ['a', 'b'] });
    expect(normalizeCompareSelection(['a', 'b', 'c']).ok).toBe(true);
    expect(normalizeCompareSelection(['a', 'b', 'c', 'd']).ok).toBe(true);
  });

  it('deduplicates while preserving order', () => {
    expect(normalizeCompareSelection(['a', 'b', 'a'])).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('treats blank entries as absent', () => {
    const result = normalizeCompareSelection(['a', '', 'b']);
    expect(result).toEqual({ ok: true, ids: ['a', 'b'] });
  });
});

describe('buildComparisonRows criteria', () => {
  const rows = buildComparisonRows([opp(), opp({ id: 'opp-2' })]);
  const criteria = rows.map((r) => r.criterion);

  it('covers every required criterion as a row', () => {
    expect(criteria).toEqual([
      'Verification',
      'Your eligibility',
      'Funding type',
      'Funding amount',
      'Deadline',
      'Minimum GPA',
      'English requirement',
      'Education level',
      'Eligible nationalities',
      'Minimum age',
      'Maximum age',
      'Official source',
      'Last verified',
    ]);
  });

  it('gives every row one cell per record in order', () => {
    for (const row of rows) {
      expect(row.cells.map((c) => c.recordId)).toEqual(['opp-1', 'opp-2']);
    }
  });

  it('labels every cell with the compare endpoint and the exact response field', () => {
    const byCriterion = new Map(rows.map((r) => [r.criterion, r.cells[0]]));
    expect(byCriterion.get('Funding type')?.source).toBe('GET /api/opportunities/compare → fundingType');
    expect(byCriterion.get('Funding amount')?.source).toBe('GET /api/opportunities/compare → fundingAmount');
    expect(byCriterion.get('Deadline')?.source).toBe('GET /api/opportunities/compare → deadline');
    expect(byCriterion.get('Minimum GPA')?.source).toBe('GET /api/opportunities/compare → minGpa');
    expect(byCriterion.get('English requirement')?.source).toBe('GET /api/opportunities/compare → englishReq');
    expect(byCriterion.get('Education level')?.source).toBe('GET /api/opportunities/compare → educationLevel');
    expect(byCriterion.get('Eligible nationalities')?.source).toBe('GET /api/opportunities/compare → eligibleNationalities');
    expect(byCriterion.get('Minimum age')?.source).toBe('GET /api/opportunities/compare → minAge');
    expect(byCriterion.get('Maximum age')?.source).toBe('GET /api/opportunities/compare → maxAge');
    expect(byCriterion.get('Official source')?.source).toBe('GET /api/opportunities/compare → officialUrl');
    expect(byCriterion.get('Last verified')?.source).toBe('GET /api/opportunities/compare → lastVerifiedAt');
    expect(byCriterion.get('Your eligibility')?.source).toBe('GET /api/opportunities/compare → eligibility.status');
  });

  it('maps eligibility engine states to the shared plain-language labels', () => {
    const row = rows.find((r) => r.criterion === 'Your eligibility')!;
    expect(row.cells[0].value).toBe('Eligible');
    const other = buildComparisonRows([
      opp({ id: 'a', eligibility: { status: 'POTENTIALLY_ELIGIBLE' } }),
      opp({ id: 'b', eligibility: { status: 'NOT_ELIGIBLE' } }),
      opp({ id: 'c', eligibility: { status: 'MISSING_INFO' } }),
      opp({ id: 'd', eligibility: null }),
    ]).find((r) => r.criterion === 'Your eligibility')!;
    expect(other.cells.map((c) => c.value)).toEqual([
      'Needs more information',
      'Not eligible',
      'Not evaluated yet',
      NOT_PROVIDED,
    ]);
  });
});

describe('missing values show the literal Not provided', () => {
  it('never guesses: null GPA, empty English text, no age limits, missing urgency-free data', () => {
    const rows = buildComparisonRows([
      opp({
        id: 'sparse',
        minGpa: null,
        englishReq: '',
        minAge: null,
        maxAge: null,
        eligibleNationalities: [],
        deadlineUrgency: undefined,
        fundingType: '',
        fundingAmount: '',
        officialUrl: '',
        lastVerifiedAt: '',
      }),
    ]);
    const byCriterion = new Map(rows.map((r) => [r.criterion, r.cells[0].value]));
    expect(byCriterion.get('Funding type')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Funding amount')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Minimum GPA')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('English requirement')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Eligible nationalities')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Minimum age')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Maximum age')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Official source')).toBe(NOT_PROVIDED);
    expect(byCriterion.get('Last verified')).toBe(NOT_PROVIDED);
  });

  it('formats present values exactly (GPA scale, nationality list, deadline with urgency)', () => {
    const rows = buildComparisonRows([opp()]);
    const byCriterion = new Map(rows.map((r) => [r.criterion, r.cells[0].value]));
    expect(byCriterion.get('Minimum GPA')).toBe('3.50 / 4.0');
    expect(byCriterion.get('Eligible nationalities')).toBe('All');
    expect(byCriterion.get('Deadline')).toBe('2027-01-15 · Upcoming');
    expect(byCriterion.get('Official source')).toBe('https://example.org/fellowship');
  });

  it('renders an empty selection without rows', () => {
    expect(buildComparisonRows([])).toEqual([]);
  });
});
