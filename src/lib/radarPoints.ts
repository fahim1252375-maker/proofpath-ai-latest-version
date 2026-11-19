/**
 * Pure data mapping for the 3D Opportunity Radar. No DOM, no fetches.
 * All inputs come from existing API responses — nothing is invented here.
 */

export interface RadarInputOpportunity {
  id: string;
  title: string;
  organization: string;
  country: string;
  category: string;
  deadline: string;
  eligibility?: { status: string } | null;
}

export interface RadarPoint {
  id: string;
  title: string;
  organization: string;
  country: string;
  category: string;
  deadline: string;
  daysLeft: number | null;
  eligibilityLabel: 'Eligible' | 'Needs more information';
  /** Deterministic angle in degrees, 0–360, stable per record. */
  angleDeg: number;
  /** Deadline-banded ring: inner = urgent, middle = upcoming, outer = long horizon. */
  ring: 'inner' | 'middle' | 'outer';
  /** Real detail route already mounted in src/App.tsx. */
  detailPath: string;
}

export type RadarMode = '3d' | 'flat' | 'static';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic pseudo-angle: a stable hash of the record id spread across
 * the full circle, then jittered so neighbouring records do not overlap.
 */
function angleForId(id: string, index: number, total: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 36000;
  }
  if (total <= 1) return hash / 100;
  const slot = (360 / total) * index;
  const jitter = (hash / 100) * (360 / total) * 0.5;
  return Math.round((slot + jitter) % 360);
}

function ringForDeadline(deadline: string, nowMs: number): RadarPoint['ring'] | null {
  const ms = new Date(deadline).getTime();
  if (Number.isNaN(ms)) return 'outer';
  const daysLeft = Math.ceil((ms - nowMs) / DAY_MS);
  if (daysLeft < 0) return null; // expired records are not plotted as upcoming points
  if (daysLeft <= 21) return 'inner';
  if (daysLeft <= 90) return 'middle';
  return 'outer';
}

/**
 * Maps real opportunity records to radar points. Only records the signed-in
 * student is eligible for (or near-eligible) are plotted, mirroring the
 * dashboard's real recommendation set.
 */
export function buildRadarPoints(
  opportunities: readonly RadarInputOpportunity[],
  now: Date = new Date()
): RadarPoint[] {
  const nowMs = now.getTime();
  const points: Array<Omit<RadarPoint, 'angleDeg'>> = [];
  for (const opp of opportunities) {
    if (!opp || typeof opp.id !== 'string' || opp.id === '') continue;
    if (opp.eligibility?.status !== 'ELIGIBLE' && opp.eligibility?.status !== 'POTENTIALLY_ELIGIBLE') {
      continue;
    }
    const ring = ringForDeadline(String(opp.deadline || ''), nowMs);
    if (ring === null) continue;
    points.push({
      id: opp.id,
      title: String(opp.title || ''),
      organization: String(opp.organization || ''),
      country: String(opp.country || ''),
      category: String(opp.category || ''),
      deadline: String(opp.deadline || ''),
      daysLeft: Number.isNaN(new Date(opp.deadline).getTime())
        ? null
        : Math.ceil((new Date(opp.deadline).getTime() - nowMs) / DAY_MS),
      eligibilityLabel: opp.eligibility.status === 'ELIGIBLE' ? 'Eligible' : 'Needs more information',
      ring,
      detailPath: `/opportunities/${opp.id}`,
    });
  }
  return points.map((point, index) => ({
    ...point,
    angleDeg: angleForId(point.id, index, points.length),
  }));
}

/**
 * Decides which rendering mode the radar card uses:
 *  - 'static': reduced motion (animated chart must not run) or no data;
 *  - 'flat': touch / hover-incapable devices (no 3D tilt);
 *  - '3d': pointer-capable, motion-allowed devices.
 */
export function resolveRadarMode(options: {
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
  pointCount: number;
}): RadarMode {
  if (options.prefersReducedMotion) return 'static';
  if (options.pointCount <= 0) return 'static';
  if (options.isTouchDevice) return 'flat';
  return '3d';
}

/** Accessible text description of the chart (WCAG: charts need a description). */
export function describeRadarChart(points: readonly RadarPoint[]): string {
  if (points.length === 0) {
    return 'Opportunity radar: no eligible matches are plotted yet. Complete your eligibility profile to generate matches.';
  }
  const urgent = points.filter((p) => p.ring === 'inner').length;
  const upcoming = points.filter((p) => p.ring === 'middle').length;
  const later = points.filter((p) => p.ring === 'outer').length;
  return `Opportunity radar with ${points.length} real match${points.length === 1 ? '' : 'es'} plotted on three deadline rings: ${urgent} within 21 days, ${upcoming} in 22–90 days, and ${later} beyond 90 days. Each point opens the opportunity's detail page.`;
}

/** Rows for the accessible data-table alternative. */
export function radarTableRows(points: readonly RadarPoint[]): Array<{
  id: string;
  title: string;
  organization: string;
  country: string;
  category: string;
  deadline: string;
  ring: RadarPoint['ring'];
  detailPath: string;
}> {
  return points.map((p) => ({
    id: p.id,
    title: p.title,
    organization: p.organization,
    country: p.country,
    category: p.category,
    deadline: p.deadline,
    ring: p.ring,
    detailPath: p.detailPath,
  }));
}
