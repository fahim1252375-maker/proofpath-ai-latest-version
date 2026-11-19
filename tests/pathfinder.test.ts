import { describe, expect, it } from 'vitest';
import { ACADEMIC_DISCIPLINES, OPPORTUNITY_GOALS, buildOpportunityFilterPath } from '../src/lib/pathfinder';

describe('student pathfinder catalogue links', () => {
  it('maps guided goals to filters accepted by the opportunity catalogue', () => {
    for (const goal of OPPORTUNITY_GOALS) {
      const url = new URL(buildOpportunityFilterPath({ category: goal.category, educationLevel: goal.educationLevel }), 'https://proofpath.test');
      if (goal.category !== 'all') expect(['scholarship', 'internship', 'competition', 'fellowship', 'grant']).toContain(url.searchParams.get('category'));
      if (goal.educationLevel !== 'all') expect(['high_school', 'undergraduate', 'masters', 'phd']).toContain(url.searchParams.get('educationLevel'));
    }
  });

  it('serializes only supported catalogue filters and omits guidance-only fields', () => {
    const path = buildOpportunityFilterPath({ category: 'scholarship', educationLevel: 'masters', fundingType: 'fully_funded', country: 'Canada', deadlineBefore: '2027-01-31' });
    expect(path).toBe('/opportunities?category=scholarship&educationLevel=masters&fundingType=fully_funded&country=Canada&deadlineBefore=2027-01-31');
    expect(path).not.toContain('discipline');
    expect(path).not.toContain('modality');
  });

  it('keeps academic interests separate from opportunity category taxonomy', () => {
    expect(ACADEMIC_DISCIPLINES.map(({ id }) => id)).toContain('it_computer_science');
    expect(new Set<string>(ACADEMIC_DISCIPLINES.map(({ id }) => id)).has('scholarship')).toBe(false);
  });
});
