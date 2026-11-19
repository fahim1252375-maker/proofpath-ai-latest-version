import { describe, expect, it } from 'vitest';
import {
  buildRadarPoints,
  describeRadarChart,
  radarTableRows,
  resolveRadarMode,
  type RadarInputOpportunity,
} from '../src/lib/radarPoints.ts';

const NOW = new Date('2026-11-17T12:00:00.000Z');

function opp(overrides: Partial<RadarInputOpportunity> = {}): RadarInputOpportunity {
  return {
    id: 'opp-1',
    title: 'Global STEM Fellowship',
    organization: 'Example Foundation',
    country: 'United Kingdom',
    category: 'fellowship',
    deadline: '2027-01-15',
    eligibility: { status: 'ELIGIBLE' },
    ...overrides,
  };
}

describe('radar data-to-point mapping', () => {
  it('maps a real record to a point with a real detail route and deadline ring', () => {
    const points = buildRadarPoints([opp()], NOW);
    expect(points).toHaveLength(1);
    expect(points[0].id).toBe('opp-1');
    expect(points[0].title).toBe('Global STEM Fellowship');
    expect(points[0].detailPath).toBe('/opportunities/opp-1');
    // 2027-01-15 is ~59 days out → middle ring
    expect(points[0].ring).toBe('middle');
    expect(points[0].eligibilityLabel).toBe('Eligible');
    expect(points[0].angleDeg).toBeGreaterThanOrEqual(0);
    expect(points[0].angleDeg).toBeLessThan(360);
  });

  it('bands rings from the real deadline: urgent, upcoming, long horizon', () => {
    const points = buildRadarPoints(
      [
        opp({ id: 'urgent', deadline: '2026-11-30', eligibility: { status: 'ELIGIBLE' } }),
        opp({ id: 'soon', deadline: '2027-01-15', eligibility: { status: 'ELIGIBLE' } }),
        opp({ id: 'later', deadline: '2027-06-30', eligibility: { status: 'ELIGIBLE' } }),
      ],
      NOW
    );
    expect(points.find((p) => p.id === 'urgent')?.ring).toBe('inner');
    expect(points.find((p) => p.id === 'soon')?.ring).toBe('middle');
    expect(points.find((p) => p.id === 'later')?.ring).toBe('outer');
  });

  it('plots only eligible or needs-more-information records from the API payload', () => {
    const points = buildRadarPoints(
      [
        opp({ id: 'a', eligibility: { status: 'ELIGIBLE' } }),
        opp({ id: 'b', eligibility: { status: 'POTENTIALLY_ELIGIBLE' } }),
        opp({ id: 'c', eligibility: { status: 'NOT_ELIGIBLE' } }),
        opp({ id: 'd', eligibility: { status: 'MISSING_INFO' } }),
        opp({ id: 'e', eligibility: null }),
      ],
      NOW
    );
    expect(points.map((p) => p.id)).toEqual(['a', 'b']);
    expect(points[1].eligibilityLabel).toBe('Needs more information');
  });

  it('skips expired-deadline records and invalid records without fabricating data', () => {
    const points = buildRadarPoints(
      [
        opp({ id: 'expired', deadline: '2026-01-01' }),
        opp({ id: '', deadline: '2027-01-01' }),
        opp({ id: 'valid' }),
      ],
      NOW
    );
    expect(points.map((p) => p.id)).toEqual(['valid']);
  });

  it('returns an empty list for empty or non-matching data', () => {
    expect(buildRadarPoints([], NOW)).toEqual([]);
    expect(buildRadarPoints([opp({ eligibility: { status: 'NOT_ELIGIBLE' } })], NOW)).toEqual([]);
  });

  it('keeps angles deterministic across calls', () => {
    const input = [opp({ id: 'x' }), opp({ id: 'y' })];
    const first = buildRadarPoints(input, NOW);
    const second = buildRadarPoints(input, NOW);
    expect(first.map((p) => p.angleDeg)).toEqual(second.map((p) => p.angleDeg));
  });
});

describe('radar mode fallback decision', () => {
  it('forces the static chart for reduced-motion users with the same data', () => {
    expect(
      resolveRadarMode({ prefersReducedMotion: true, isTouchDevice: false, pointCount: 5 })
    ).toBe('static');
  });

  it('gives touch devices a flat layout without 3D tilt', () => {
    expect(
      resolveRadarMode({ prefersReducedMotion: false, isTouchDevice: true, pointCount: 5 })
    ).toBe('flat');
  });

  it('uses the 3D scene only for pointer-capable, motion-allowed devices with data', () => {
    expect(
      resolveRadarMode({ prefersReducedMotion: false, isTouchDevice: false, pointCount: 5 })
    ).toBe('3d');
  });

  it('falls back to static when there are no points, whatever the device', () => {
    expect(resolveRadarMode({ prefersReducedMotion: false, isTouchDevice: false, pointCount: 0 })).toBe('static');
    expect(resolveRadarMode({ prefersReducedMotion: false, isTouchDevice: true, pointCount: 0 })).toBe('static');
  });
});

describe('accessible description and table alternative', () => {
  it('describes an empty radar as an action, not a failure', () => {
    expect(describeRadarChart([])).toContain('no eligible matches are plotted yet');
    expect(describeRadarChart([])).toContain('Complete your eligibility profile');
  });

  it('describes ring contents from real counts', () => {
    const points = buildRadarPoints(
      [
        opp({ id: 'urgent', deadline: '2026-11-30' }),
        opp({ id: 'soon', deadline: '2027-01-15' }),
        opp({ id: 'later', deadline: '2027-06-30' }),
      ],
      NOW
    );
    const description = describeRadarChart(points);
    expect(description).toContain('3 real matches');
    expect(description).toContain('1 within 21 days');
    expect(description).toContain('1 in 22–90 days');
    expect(description).toContain('1 beyond 90 days');
    expect(description).toContain('detail page');
  });

  it('builds table rows with the same records and real detail routes', () => {
    const points = buildRadarPoints([opp()], NOW);
    const rows = radarTableRows(points);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Global STEM Fellowship');
    expect(rows[0].detailPath).toBe('/opportunities/opp-1');
    expect(rows[0].ring).toBe('middle');
  });
});
