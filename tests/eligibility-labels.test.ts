import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ELIGIBILITY_ESTIMATE_NOTICE,
  ELIGIBILITY_STATE_COPY,
  ELIGIBILITY_STATE_ORDER,
  eligibilityStateCopy,
} from '../src/lib/eligibilityLabels.ts';

const ENGINE_STATES = ['ELIGIBLE', 'POTENTIALLY_ELIGIBLE', 'MISSING_INFO', 'NOT_ELIGIBLE'] as const;

describe('eligibility state label mapping', () => {
  it('maps every engine status to its plain-language label exactly once', () => {
    expect(ELIGIBILITY_STATE_COPY.ELIGIBLE.label).toBe('Eligible');
    expect(ELIGIBILITY_STATE_COPY.NOT_ELIGIBLE.label).toBe('Not eligible');
    expect(ELIGIBILITY_STATE_COPY.POTENTIALLY_ELIGIBLE.label).toBe('Needs more information');
    expect(ELIGIBILITY_STATE_COPY.MISSING_INFO.label).toBe('Not evaluated yet');
    expect(Object.keys(ELIGIBILITY_STATE_COPY).sort()).toEqual([...ENGINE_STATES].sort());
  });

  it('gives every state a one-sentence meaning and a next action', () => {
    for (const status of ENGINE_STATES) {
      const copy = ELIGIBILITY_STATE_COPY[status];
      expect(copy.meaning.trim().endsWith('.')).toBe(true);
      expect(copy.meaning.split(/[.!?]/).filter((s) => s.trim()).length).toBe(1);
      expect(copy.nextAction.trim().endsWith('.')).toBe(true);
      expect(copy.nextAction.length).toBeGreaterThan(20);
    }
  });

  it('explains the incomplete states as missing information, not failure', () => {
    expect(ELIGIBILITY_STATE_COPY.POTENTIALLY_ELIGIBLE.meaning).toContain('missing or sits just below a published cutoff');
    expect(ELIGIBILITY_STATE_COPY.MISSING_INFO.meaning).toContain('no eligibility conclusion was possible');
    expect(ELIGIBILITY_STATE_COPY.NOT_ELIGIBLE.meaning.toLowerCase()).toContain('at least one published requirement is not met');
  });

  it('keeps an explicit estimate notice that is never an official decision', () => {
    expect(ELIGIBILITY_ESTIMATE_NOTICE).toContain('estimate');
    expect(ELIGIBILITY_ESTIMATE_NOTICE).toContain('not an official admission or funding decision');
  });

  it('orders the legend from best to unresolved to unmet', () => {
    expect(ELIGIBILITY_STATE_ORDER).toEqual(['ELIGIBLE', 'POTENTIALLY_ELIGIBLE', 'MISSING_INFO', 'NOT_ELIGIBLE']);
  });
});

describe('eligibilityStateCopy', () => {
  it('resolves each engine value', () => {
    expect(eligibilityStateCopy('ELIGIBLE')?.label).toBe('Eligible');
    expect(eligibilityStateCopy('NOT_ELIGIBLE')?.label).toBe('Not eligible');
    expect(eligibilityStateCopy('POTENTIALLY_ELIGIBLE')?.label).toBe('Needs more information');
    expect(eligibilityStateCopy('MISSING_INFO')?.label).toBe('Not evaluated yet');
  });

  it('never invents copy for values outside the engine enum', () => {
    expect(eligibilityStateCopy('UNKNOWN_FUTURE_STATE')).toBeNull();
    expect(eligibilityStateCopy('eligible')).toBeNull();
    expect(eligibilityStateCopy('')).toBeNull();
    expect(eligibilityStateCopy(null)).toBeNull();
    expect(eligibilityStateCopy(undefined)).toBeNull();
  });
});

describe('shared EligibilityStatusTag stays aligned with eligibilityLabels', () => {
  const commonSource = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'components', 'ui', 'Common.tsx'),
    'utf8'
  );

  function tagSection(source: string): string {
    const start = source.indexOf('export function EligibilityStatusTag');
    const next = source.indexOf('export function', start + 10);
    return source.slice(start, next === -1 ? undefined : next);
  }

  it('no stale labels remain in EligibilityStatusTag', () => {
    const section = tagSection(commonSource);
    expect(section).not.toContain('Potentially Eligible');
    expect(section).not.toContain("'Missing Info'");
    expect(section).not.toContain("'Not Eligible'");
  });

  it('reads its labels from ELIGIBILITY_STATE_COPY via direct record access', () => {
    const section = tagSection(commonSource);
    // The three previously stale labels now use direct record access; the
    // ELIGIBLE entry already had the correct literal, so three lookups is the
    // exact expected count.
    const lookups = section.match(/ELIGIBILITY_STATE_COPY\.\w+\.label/g) ?? [];
    expect(lookups).toHaveLength(3);
    expect(lookups).toContain('ELIGIBILITY_STATE_COPY.POTENTIALLY_ELIGIBLE.label');
    expect(lookups).toContain('ELIGIBILITY_STATE_COPY.NOT_ELIGIBLE.label');
    expect(lookups).toContain('ELIGIBILITY_STATE_COPY.MISSING_INFO.label');
    expect(section).not.toMatch(/\.label!/); // no non-null assertions
  });
});
