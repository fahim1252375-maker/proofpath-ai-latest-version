import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { StudentProfile } from '../../types';
import {
  READINESS_NOTICE,
  buildReadinessScorecard,
  type ApplicationLike,
  type Confidence,
  type EligibilityDistributionLike,
  type ReadinessScore,
} from '../../lib/readinessScores';
import { SkeletonBlock } from '../ui/Common';

interface AnalyticsPayload {
  eligibilityDistribution?: Partial<EligibilityDistributionLike>;
}

interface ApplicationPayloadItem {
  id: string;
  status: string;
  deadline: string;
  checklist: Array<{ done?: boolean }>;
  documents: Array<{ docName?: string; isReady?: boolean }>;
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  complete: 'All inputs present',
  partial: 'Partial — see missing inputs',
  unavailable: 'Not available yet',
};

function toApplicationLike(items: ApplicationPayloadItem[]): ApplicationLike[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    deadline: item.deadline,
    checklist: Array.isArray(item.checklist) ? item.checklist : [],
    documents: Array.isArray(item.documents) ? item.documents : [],
  }));
}

export function ReadinessScorecard() {
  const { user } = useAuth();
  const [scores, setScores] = useState<ReadinessScore[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(() => {
    if (!user) {
      setScores(null);
      setLoading(false);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      apiRequest<{ profile: StudentProfile | null }>('/api/profile'),
      apiRequest<AnalyticsPayload>('/api/analytics/student'),
      apiRequest<{ items: ApplicationPayloadItem[] }>('/api/applications'),
    ])
      .then(([profileRes, analytics, applicationsRes]) => {
        if (cancelled) return;
        // Unexpected shapes are treated as missing inputs, never as zeros.
        const distribution: EligibilityDistributionLike | null =
          analytics?.eligibilityDistribution &&
          typeof analytics.eligibilityDistribution.ELIGIBLE === 'number'
            ? {
                ELIGIBLE: Number(analytics.eligibilityDistribution.ELIGIBLE) || 0,
                POTENTIALLY_ELIGIBLE: Number(analytics.eligibilityDistribution.POTENTIALLY_ELIGIBLE) || 0,
                NOT_ELIGIBLE: Number(analytics.eligibilityDistribution.NOT_ELIGIBLE) || 0,
                MISSING_INFO: Number(analytics.eligibilityDistribution.MISSING_INFO) || 0,
              }
            : null;
        const applications = Array.isArray(applicationsRes?.items) ? toApplicationLike(applicationsRes.items) : null;
        setScores(
          buildReadinessScorecard({
            profile: (profileRes?.profile as typeof profileRes.profile & object) || null,
            eligibilityDistribution: distribution,
            applications,
          })
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Readiness data could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <section aria-labelledby="readiness-heading" className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
        <h2 id="readiness-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
          Personal readiness scorecard
        </h2>
        <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
          Sign in to see your readiness scores computed from your saved profile and applications.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="readiness-heading" className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="readiness-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
          Personal readiness scorecard
        </h2>
        <button
          type="button"
          onClick={() => setReloadToken((t) => t + 1)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#5E6B5B] hover:bg-[#F7F7F0] dark:text-[#A9B5A6] dark:hover:bg-[#1D2520]"
          aria-label="Recalculate readiness scores"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Recalculate
        </button>
      </div>

      {loading ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {error}
          </p>
          <button type="button" onClick={load} className="mt-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : scores ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scores.map((score) => (
              <ReadinessCard key={score.key} score={score} />
            ))}
          </div>
          <p className="mt-3 border-t border-[#E4E8E0] pt-2 text-[11px] text-[#71806E] dark:border-[#232D27] dark:text-[#8C9A88]">
            {READINESS_NOTICE}
          </p>
        </>
      ) : null}
    </section>
  );
}

function ReadinessCard({ score }: { score: ReadinessScore }) {
  return (
    <div className="flex flex-col rounded-lg border border-[#E4E8E0] bg-[#FBFBF7] p-3 dark:border-[#2C3730] dark:bg-[#101713]">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">{score.label}</h3>
        <span className="font-mono text-lg font-bold tabular-nums text-[#101713] dark:text-[#C5F36A]">
          {score.score === null ? '—' : `${score.score}%`}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[#71806E] dark:text-[#8C9A88]">
        <Info className="mr-1 inline h-3 w-3" aria-hidden="true" />
        {score.formula}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#5E6B5B] dark:text-[#A9B5A6]">
        {CONFIDENCE_LABEL[score.confidence]}
      </p>

      {score.inputs.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] leading-snug">
          {score.inputs.map((input, i) => (
            <li key={i} title={`Source: ${input.source}`}>
              <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{input.label}:</span>{' '}
              <span className="font-mono text-[10px] text-[#243329] dark:text-[#D5DDD2]">{input.value}</span>{' '}
              <span className="text-[9px] text-[#71806E] dark:text-[#8C9A88]">({input.source})</span>
            </li>
          ))}
        </ul>
      )}

      {score.missing.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px] leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">Missing (not counted as zero):</p>
          <ul className="mt-0.5 list-disc pl-3">
            {score.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {score.score === null && (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#5E6B5B] dark:text-[#8C9A88]">
          Not available yet — add the missing inputs above
        </p>
      )}
    </div>
  );
}
