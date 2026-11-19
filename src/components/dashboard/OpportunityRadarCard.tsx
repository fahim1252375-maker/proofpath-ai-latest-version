import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Loader2, Radar, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { OpportunityItem } from '../../types';
import {
  buildRadarPoints,
  describeRadarChart,
  radarTableRows,
  resolveRadarMode,
  type RadarMode,
  type RadarPoint,
} from '../../lib/radarPoints';

export interface OpportunityRadarCardProps {
  matchedCount: number;
  educationLevel: string;
  gpa: number | null;
  gpaScale: number;
  financialNeed: string;
  targetCountries: string[];
  academicInterests: string[];
  profileIncomplete: boolean;
  onTune: () => void;
  onExplore: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

function readable(value: string): string {
  return value.replace(/_/g, ' ').trim() || 'Not set';
}

function compactList(values: string[], emptyLabel: string): string {
  if (values.length === 0) return emptyLabel;
  const visible = values.slice(0, 2).join(' · ');
  return values.length > 2 ? `${visible} +${values.length - 2}` : visible;
}

function mediaMatches(query: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function OpportunityRadarCard({
  matchedCount,
  educationLevel,
  gpa,
  gpaScale,
  financialNeed,
  targetCountries,
  academicInterests,
  profileIncomplete,
  onTune,
  onExplore,
}: OpportunityRadarCardProps) {
  const countryLabel = compactList(targetCountries, 'Global / open');
  const interestLabel = compactList(academicInterests, 'Add academic interests');
  const academicLabel = gpa === null
    ? `${readable(educationLevel)} · GPA needed`
    : `${readable(educationLevel)} · ${gpa}/${gpaScale}`;

  const { user } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [points, setPoints] = useState<RadarPoint[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // Signed-out users: never fetch, never show example points.
    if (!user) {
      setPoints([]);
      setLoadState('ready');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    apiRequest<{ items: OpportunityItem[] }>('/api/opportunities?limit=50&sort=deadline_asc')
      .then((data) => {
        if (cancelled) return;
        // Reject unexpected shapes entirely — never render partial points.
        if (!data || !Array.isArray(data.items)) {
          setLoadState('error');
          return;
        }
        setPoints(buildRadarPoints(data.items));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, user]);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => mediaMatches('(prefers-reduced-motion: reduce)'));
  const [isTouchDevice, setIsTouchDevice] = useState(() => mediaMatches('(hover: none), (pointer: coarse)'));

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touchQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => {
      setPrefersReducedMotion(motionQuery.matches);
      setIsTouchDevice(touchQuery.matches);
    };
    update();
    motionQuery.addEventListener?.('change', update);
    touchQuery.addEventListener?.('change', update);
    return () => {
      motionQuery.removeEventListener?.('change', update);
      touchQuery.removeEventListener?.('change', update);
    };
  }, []);

  const mode: RadarMode = useMemo(
    () => resolveRadarMode({ prefersReducedMotion, isTouchDevice, pointCount: points.length }),
    [prefersReducedMotion, isTouchDevice, points.length]
  );
  const chartDescription = useMemo(() => describeRadarChart(points), [points]);
  const tableRows = useMemo(() => radarTableRows(points), [points]);

  return (
    <section className="pp-radar-card" aria-labelledby="personal-radar-title">
      <div className="pp-radar-top">
        <div>
          <p className="pp-radar-eyebrow">
            <Radar className="h-3.5 w-3.5" aria-hidden="true" />
            Personal opportunity radar
          </p>
          <h2 id="personal-radar-title" className="pp-radar-heading">Your opportunity field</h2>
        </div>
        <span className={`pp-radar-status ${profileIncomplete ? 'is-incomplete' : 'is-ready'}`}>
          <span className="pp-radar-status-dot" aria-hidden="true" />
          {profileIncomplete ? 'Needs setup' : 'Core profile ready'}
        </span>
      </div>

      <div className="pp-radar-visual-row">
        <div className="pp-radar-scene-wrap">
          {loadState === 'loading' && (
            <div className="pp-radar-state" role="status" aria-live="polite">
              <Loader2 className="pp-radar-state-icon pp-radar-spin" aria-hidden="true" />
              <p>Loading your real matches from the opportunity catalog…</p>
            </div>
          )}

          {loadState === 'error' && (
            <div className="pp-radar-state" role="alert">
              <p>The radar could not load your opportunity records.</p>
              <button
                type="button"
                className="pp-radar-button pp-radar-button-secondary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {loadState === 'ready' && points.length === 0 && (
            user ? (
              <div className="pp-radar-state" role="status">
                <p>
                  {profileIncomplete
                    ? 'No eligible matches plotted yet. Complete your eligibility profile to generate them.'
                    : 'No open, eligible matches right now. Save your profile and check back, or explore the full catalog.'}
                </p>
                <button type="button" className="pp-radar-button pp-radar-button-primary" onClick={onTune}>
                  {profileIncomplete ? 'Complete profile' : 'Open catalog'}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="pp-radar-state" role="status">
                <p>Sign in to plot your real eligible opportunities on the radar.</p>
                <button type="button" className="pp-radar-button pp-radar-button-primary" onClick={() => window.location.assign('/login')}>
                  Sign in
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )
          )}

          {loadState === 'ready' && points.length > 0 && (
            <RadarScene mode={mode} points={points} matchedCount={matchedCount} description={chartDescription} tableRows={tableRows} />
          )}
        </div>

        <div className="pp-radar-detail">
          <p className="pp-radar-summary">
            {profileIncomplete
              ? 'A few profile details are missing. Add them to make your opportunity matching more useful.'
              : 'Your matching view is using the profile signals below. Update them any time your goals change.'}
          </p>
          <div className="pp-radar-signals">
            <div className="pp-radar-signal">
              <span>Academic profile</span>
              <strong title={academicLabel}>{academicLabel}</strong>
            </div>
            <div className="pp-radar-signal">
              <span>Target countries</span>
              <strong title={targetCountries.join(', ') || 'Global / open'}>{countryLabel}</strong>
            </div>
            <div className="pp-radar-signal">
              <span>Academic focus</span>
              <strong title={academicInterests.join(', ') || 'Not set'}>{interestLabel}</strong>
            </div>
            <div className="pp-radar-signal">
              <span>Funding preference</span>
              <strong>{readable(financialNeed)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="pp-radar-footer">
        <p>Matches are indicative. Review each program's official criteria before applying.</p>
        <div className="pp-radar-actions">
          <button type="button" className="pp-radar-button pp-radar-button-secondary" onClick={onTune}>
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Tune profile
          </button>
          <button type="button" className="pp-radar-button pp-radar-button-primary" onClick={onExplore}>
            Explore matches
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

function RadarScene({
  mode,
  points,
  matchedCount,
  description,
  tableRows,
}: {
  mode: RadarMode;
  points: RadarPoint[];
  matchedCount: number;
  description: string;
  tableRows: ReturnType<typeof radarTableRows>;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const tiltEnabled = mode === '3d';

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tiltEnabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 10, y: px * 12 });
  };

  return (
    <div className={`pp-radar-scene is-${mode}`}>
      <p className="sr-only">{description}</p>

      {/* Accessible list: same items, keyboard-operable real links. */}
      <ul className="pp-radar-list" aria-label="Eligible opportunities plotted on the radar">
        {tableRows.map((row) => (
          <li key={row.id}>
            <a href={row.detailPath} className="pp-radar-list-link">
              <span className="pp-radar-list-title">{row.title}</span>
              <span className="pp-radar-list-meta">
                {row.country} · {row.ring === 'inner' ? 'deadline within 21 days' : row.ring === 'middle' ? 'deadline in 22–90 days' : 'deadline beyond 90 days'}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div
        className="pp-radar-orbit-viewport"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => tiltEnabled && setTilt({ x: 0, y: 0 })}
      >
        <div
          className="pp-radar-orbit-system"
          style={
            tiltEnabled && (tilt.x !== 0 || tilt.y !== 0)
              ? { transform: `rotateX(${58 + tilt.x}deg) rotateZ(${-25 + tilt.y}deg)` }
              : undefined
          }
          aria-hidden="true"
        >
          <span className="pp-radar-ring pp-radar-ring-outer" />
          <span className="pp-radar-ring pp-radar-ring-middle" />
          <span className="pp-radar-ring pp-radar-ring-inner" />
          {tiltEnabled && <span className="pp-radar-sweep" />}
          {points.map((point) => (
            <span
              key={point.id}
              className={`pp-radar-point is-ring-${point.ring}`}
              style={{
                '--pp-point-angle': `${point.angleDeg}deg`,
              } as React.CSSProperties}
            />
          ))}
          <span className="pp-radar-axis" />
        </div>
        <div className="pp-radar-core" aria-hidden="true">
          <span className="pp-radar-count">{matchedCount}</span>
          <span className="pp-radar-count-label">{matchedCount === 1 ? 'match' : 'matches'}</span>
        </div>
        <span className="pp-radar-float-tag pp-radar-tag-top" aria-hidden="true">URGENT ≤21D</span>
        <span className="pp-radar-float-tag pp-radar-tag-right" aria-hidden="true">22–90D</span>
        <span className="pp-radar-float-tag pp-radar-tag-bottom" aria-hidden="true">90D+</span>
      </div>

      {/* Data-table alternative (also used by static mode). */}
      <table className="pp-radar-table">
        <caption className="sr-only">Eligible opportunities with deadlines, grouped by deadline ring</caption>
        <thead>
          <tr>
            <th scope="col">Opportunity</th>
            <th scope="col">Country</th>
            <th scope="col">Deadline ring</th>
            <th scope="col">Link</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => (
            <tr key={row.id}>
              <td>{row.title}</td>
              <td>{row.country}</td>
              <td>{row.ring === 'inner' ? 'Urgent (≤21 days)' : row.ring === 'middle' ? 'Upcoming (22–90 days)' : 'Long horizon (90+ days)'}</td>
              <td><a href={row.detailPath}>Open details</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
