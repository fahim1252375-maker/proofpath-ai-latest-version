import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Bot,
  Calendar,
  Compass,
  FileCheck2,
  Kanban,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { OpportunityRadarCard } from '../components/dashboard/OpportunityRadarCard';
import { ReadinessScorecard } from '../components/dashboard/ReadinessScorecard';
import { useAuth } from '../context/AuthContext';
import type { OpportunityItem } from '../types';
import {
  DistributionRingChart,
  HorizontalBarChart,
  IntelligenceScoreGauge,
} from '../components/charts/AnalyticsCharts';
import {
  EligibilityStatusTag,
  EmptyState,
  SkeletonBlock,
  VerificationStatusTag,
} from '../components/ui/Common';

interface StudentAnalyticsPayload {
  kpis: {
    verifiedOpportunities: number;
    savedOpportunities: number;
    activeApplications: number;
    totalReportsRun: number;
  };
  intelligenceScore: {
    totalScore: number;
    components: Array<{
      label: string;
      score: number;
      maxScore: number;
      explanation: string;
    }>;
    formulaSummary: string;
  };
  personalRadar: {
    educationLevel: string;
    gpa: number | null;
    gpaScale: number;
    financialNeed: string;
    targetCountries: string[];
    academicInterests: string[];
    matchedCount: number;
  };
  deadlineIntelligence: {
    urgent: Array<{
      id: string;
      title: string;
      organization: string;
      deadline: string;
      source: 'application' | 'opportunity';
      link: string;
      daysLeft: number;
    }>;
    upcoming: Array<{
      id: string;
      title: string;
      organization: string;
      deadline: string;
      source: 'application' | 'opportunity';
      link: string;
      daysLeft: number;
    }>;
    recentlyExpired: Array<{
      id: string;
      title: string;
      organization: string;
      deadline: string;
      source: 'application' | 'opportunity';
      link: string;
      daysLeft: number;
    }>;
  };
  actionCenter: Array<{
    id: string;
    title: string;
    detail: string;
    link: string;
    priority: 'high' | 'medium';
  }>;
  applicationPipeline: Array<{ status: string; count: number }>;
  eligibilityDistribution: Array<{ status: string; count: number }>;
  verificationDistribution: Array<{ status: string; count: number }>;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    organization: string;
    status: string;
    deadline: string;
  }>;
  recommendations: OpportunityItem[];
  riskAlerts: Array<{
    id: string;
    submitted_title: string;
    submitted_url: string;
    overall_status: string;
    created_at: string;
  }>;
}

export function DashboardOverview({ navigate }: { navigate: (path: string) => void }) {
  const { user, profile } = useAuth();
  const [data, setData] = useState<StudentAnalyticsPayload | null>(null);
  const [savedItems, setSavedItems] = useState<OpportunityItem[]>([]);
  const [deadlineTab, setDeadlineTab] = useState<'urgent' | 'upcoming' | 'expired'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      apiRequest<StudentAnalyticsPayload>('/api/analytics/student'),
      apiRequest<{ items: OpportunityItem[] }>('/api/saved'),
    ])
      .then(([analytics, saved]) => {
        setData(analytics);
        setSavedItems(saved.items);
        if (analytics.deadlineIntelligence?.urgent?.length > 0) {
          setDeadlineTab('urgent');
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'The dashboard data could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, [loadAttempt]);

  if (loading) {
    return (
      <div className="pp-depth-page pp-depth-dashboard space-y-6">
        <SkeletonBlock className="h-44 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonBlock className="h-24 rounded-xl" />
          <SkeletonBlock className="h-24 rounded-xl" />
          <SkeletonBlock className="h-24 rounded-xl" />
          <SkeletonBlock className="h-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonBlock className="h-64 rounded-xl" />
          <SkeletonBlock className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div role="alert">
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Your dashboard could not load"
          description={loadError || 'Try again in a moment.'}
          action={(
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="rounded-lg bg-[#101713] px-4 py-2.5 text-sm font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              Try again
            </button>
          )}
        />
      </div>
    );
  }

  const profileIncomplete = !profile?.nationality || !profile?.educationLevel || profile?.gpa === null;
  const activeDeadlines =
    deadlineTab === 'urgent'
      ? data.deadlineIntelligence.urgent
      : deadlineTab === 'upcoming'
      ? data.deadlineIntelligence.upcoming
      : data.deadlineIntelligence.recentlyExpired;

  return (
    <div className="pp-depth-page pp-depth-dashboard space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#E4E8E0] bg-white/80 px-5 py-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between dark:border-[#232D27] dark:bg-[#141B17]/85">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#71806E] dark:text-[#C5F36A]">Global command center</p>
          <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#A9B5A6]">
            A clear view of your next steps, deadlines, and opportunity signals.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={focusMode}
          onClick={() => setFocusMode((current) => !current)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ${
            focusMode
              ? 'border-[#C5F36A] bg-[#C5F36A] text-[#101713]'
              : 'border-[#E4E8E0] bg-[#F7F7F0] text-[#101713] hover:border-[#C5F36A] dark:border-[#2C3730] dark:bg-[#0C110E] dark:text-[#F7F7F0]'
          }`}
        >
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {focusMode ? 'Exit focus mode' : 'Focus on next steps'}
        </button>
      </div>
      {focusMode && (
        <p className="rounded-lg border border-[#DDE8C7] bg-[#F3F8E9] px-4 py-2.5 text-xs text-[#40513A] dark:border-[#3A4B33] dark:bg-[#192319] dark:text-[#D6E9C2]" role="status">
          Focus mode is on. Charts and saved shortcuts are tucked away; your actions, deadlines, recommendations, and safety alerts stay visible.
        </p>
      )}
      {/* Command Header + Opportunity Intelligence Score */}
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <div className="pp-dashboard-hero flex flex-col justify-between rounded-2xl border border-[#232D27] bg-[#101713] p-6 text-[#F7F7F0] 2xl:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <IntelligenceScoreGauge score={data.intelligenceScore.totalScore} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-semibold tracking-wider text-[#C5F36A] uppercase">
                Opportunity Intelligence Score
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold text-[#F7F7F0]">
                {user?.fullName}
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-[#A9B5A6]">
                {data.intelligenceScore.formulaSummary}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/verify')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#C5F36A] px-3.5 py-2 text-xs font-semibold text-[#101713] hover:bg-[#b5e458] whitespace-nowrap"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  <span>Verify URL / File</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/assistant')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2C3730] px-3.5 py-2 text-xs font-semibold text-[#F7F7F0] hover:bg-[#1D2520] whitespace-nowrap"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>Ask AI Advisor</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/applications')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2C3730] px-3.5 py-2 text-xs font-semibold text-[#F7F7F0] hover:bg-[#1D2520] whitespace-nowrap"
                >
                  <Kanban className="h-3.5 w-3.5" />
                  <span>Applications</span>
                </button>
              </div>
            </div>
          </div>

          {/* Transparent Component Breakdown */}
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-[#232D27] pt-5 sm:grid-cols-2 xl:grid-cols-4">
            {data.intelligenceScore.components.map((comp) => (
              <div key={comp.label} title={comp.explanation}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#D5DDD2]">{comp.label}</span>
                  <span className="font-mono font-bold text-[#C5F36A] tabular-nums">
                    {comp.score}/{comp.maxScore}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[#232D27]">
                  <div
                    className="h-full bg-[#C5F36A]"
                    style={{ width: `${Math.round((comp.score / comp.maxScore) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-[#8C9A88]">{comp.explanation}</p>
              </div>
            ))}
          </div>
        </div>

        <OpportunityRadarCard
          matchedCount={data.personalRadar.matchedCount}
          educationLevel={data.personalRadar.educationLevel}
          gpa={data.personalRadar.gpa}
          gpaScale={data.personalRadar.gpaScale}
          financialNeed={data.personalRadar.financialNeed}
          targetCountries={data.personalRadar.targetCountries}
          academicInterests={data.personalRadar.academicInterests}
          profileIncomplete={profileIncomplete}
          onTune={() => navigate('/dashboard/eligibility')}
          onExplore={() => navigate('/opportunities')}
        />

        <ReadinessScorecard />
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
          <p className="text-xs font-medium text-[#5E6B5B] dark:text-[#8C9A88]">Verified Opportunities</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
            {data.kpis.verifiedOpportunities}
          </p>
          <button
            type="button"
            onClick={() => navigate('/opportunities')}
            className="mt-2 text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            Explore directory →
          </button>
        </div>
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
          <p className="text-xs font-medium text-[#5E6B5B] dark:text-[#8C9A88]">Saved Shortlist</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
            {data.kpis.savedOpportunities}
          </p>
          <p className="mt-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Bookmarked programs</p>
        </div>
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
          <p className="text-xs font-medium text-[#5E6B5B] dark:text-[#8C9A88]">Active Applications</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
            {data.kpis.activeApplications}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/applications')}
            className="mt-2 text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            Open pipeline →
          </button>
        </div>
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
          <p className="text-xs font-medium text-[#5E6B5B] dark:text-[#8C9A88]">Your Audit Reports</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
            {data.kpis.totalReportsRun}
          </p>
          <button
            type="button"
            onClick={() => navigate('/verify')}
            className="mt-2 text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            New verification →
          </button>
        </div>
      </div>

      {/* Personal Action Center + Deadline Intelligence */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-6 xl:col-span-6 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
              <Target className="h-4 w-4 text-[#101713] dark:text-[#C5F36A]" />
              <span>Personal Action Center</span>
            </h2>
            <span className="font-mono text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              {data.actionCenter.length} Next Step(s)
            </span>
          </div>

          {data.actionCenter.length === 0 ? (
            <p className="mt-4 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              All profile attributes, checklists, and verifications are up to date.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.actionCenter.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => navigate(act.link)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-3.5 text-left transition-colors hover:border-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:hover:border-[#C5F36A]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-[10px] font-bold uppercase ${
                          act.priority === 'high' ? 'text-amber-700 dark:text-[#C5F36A]' : 'text-[#5E6B5B]'
                        }`}
                      >
                        [{act.priority}]
                      </span>
                      <p className="truncate text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {act.title}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{act.detail}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#5E6B5B] dark:text-[#C5F36A]" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Deadline Intelligence */}
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-6 xl:col-span-6 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
              <Calendar className="h-4 w-4 text-[#101713] dark:text-[#C5F36A]" />
              <span>Deadline Intelligence</span>
            </h2>
            <div className="flex items-center gap-1 rounded-lg bg-[#F7F7F0] p-1 dark:bg-[#0C110E]">
              {[
                { id: 'urgent', label: `Urgent (${data.deadlineIntelligence.urgent.length})` },
                { id: 'upcoming', label: `Upcoming (${data.deadlineIntelligence.upcoming.length})` },
                { id: 'expired', label: `Expired (${data.deadlineIntelligence.recentlyExpired.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDeadlineTab(t.id as typeof deadlineTab)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    deadlineTab === t.id
                      ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                      : 'text-[#5E6B5B] hover:text-[#101713] dark:text-[#8C9A88] dark:hover:text-[#F7F7F0]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {activeDeadlines.length === 0 ? (
            <p className="mt-6 text-center text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              No deadlines in this window.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
              {activeDeadlines.map((d) => (
                <li key={`${d.source}_${d.id}`} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => navigate(d.link)}
                    className="min-w-0 text-left hover:underline"
                  >
                    <p className="truncate font-semibold text-[#101713] dark:text-[#F7F7F0]">{d.title}</p>
                    <p className="text-[#5E6B5B] dark:text-[#8C9A88]">
                      {d.organization} · {d.source}
                    </p>
                  </button>
                  <div className="text-right shrink-0">
                    <span className="block font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                      {d.deadline}
                    </span>
                    <span className="font-mono text-[11px] text-[#5E6B5B] dark:text-[#C5F36A]">
                      {d.daysLeft < 0 ? `${Math.abs(d.daysLeft)}d ago` : `${d.daysLeft}d left`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!focusMode && (
        <>
      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DistributionRingChart
          title="Catalog Eligibility Breakdown"
          subtitle="Live match status across published opportunities"
          data={[
            {
              label: 'Eligible',
              value: data.eligibilityDistribution.find((d) => d.status === 'ELIGIBLE')?.count || 0,
              color: '#16A34A',
            },
            {
              label: 'Potentially Eligible',
              value:
                data.eligibilityDistribution.find((d) => d.status === 'POTENTIALLY_ELIGIBLE')
                  ?.count || 0,
              color: '#101713',
            },
            {
              label: 'Missing Info',
              value:
                data.eligibilityDistribution.find((d) => d.status === 'MISSING_INFO')?.count || 0,
              color: '#D97706',
            },
            {
              label: 'Not Eligible',
              value:
                data.eligibilityDistribution.find((d) => d.status === 'NOT_ELIGIBLE')?.count || 0,
              color: '#DC2626',
            },
          ]}
        />

        <HorizontalBarChart
          title="Application Pipeline Progress"
          subtitle="Current tracked submissions by stage"
          emptyLabel="Add an opportunity to your Application Tracker to see pipeline metrics."
          data={[
            {
              label: 'Researching',
              value: data.applicationPipeline.find((p) => p.status === 'researching')?.count || 0,
              color: '#8C9A88',
            },
            {
              label: 'Preparing',
              value: data.applicationPipeline.find((p) => p.status === 'preparing')?.count || 0,
              color: '#1D2520',
            },
            {
              label: 'Submitted',
              value: data.applicationPipeline.find((p) => p.status === 'submitted')?.count || 0,
              color: '#0284C7',
            },
            {
              label: 'Interview',
              value: data.applicationPipeline.find((p) => p.status === 'interview')?.count || 0,
              color: '#D97706',
            },
            {
              label: 'Accepted',
              value: data.applicationPipeline.find((p) => p.status === 'accepted')?.count || 0,
              color: '#16A34A',
            },
          ]}
        />
      </div>

        </>
      )}

      {/* Recommendations + Risk Alerts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-6 xl:col-span-7 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                Recommended Opportunities
              </h2>
              <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                Matched to your eligibility profile &amp; Match Intelligence. Review each listing's evidence status.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/eligibility')}
              className="text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
            >
              Update Profile
            </button>
          </div>

          {data.recommendations.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<Compass className="h-5 w-5" />}
                title="Complete your eligibility profile"
                description="Add your nationality, degree level, and GPA to see matched scholarships and internships."
                action={
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/eligibility')}
                    className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
                  >
                    Set Up Profile
                  </button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
              {data.recommendations.map((opp) => (
                <div key={opp.id} className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/opportunities/${opp.id}`)}
                      className="text-left font-display text-sm font-bold text-[#101713] hover:underline dark:text-[#F7F7F0]"
                    >
                      {opp.title}
                    </button>
                    <p className="mt-0.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                      {opp.organization} · {opp.country} · Deadline{' '}
                      <span className="font-mono tabular-nums">{opp.deadline}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {opp.eligibility && <EligibilityStatusTag status={opp.eligibility.status} />}
                    <VerificationStatusTag status={opp.verificationStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Risk Alerts */}
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-6 xl:col-span-5 dark:border-[#232D27] dark:bg-[#141B17]">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Risk &amp; Unverified Alerts</span>
          </h2>
          {data.riskAlerts.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700 dark:text-[#C5F36A]">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>No contradicted or unverified submissions flagged recently.</span>
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {data.riskAlerts.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                >
                  <span className="truncate font-medium text-[#101713] dark:text-[#F7F7F0]">
                    {r.submitted_title || r.submitted_url || 'Submission'}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/verify?report=${r.id}`)}
                    className="inline-flex items-center gap-1 font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 shrink-0 dark:text-[#C5F36A]"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!focusMode && (
        <>
      {/* Saved Shortlist */}
      <div className="rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
            <Bookmark className="h-4 w-4 text-[#101713] dark:text-[#C5F36A]" />
            <span>Saved Shortlist</span>
          </h2>
          <button
            type="button"
            onClick={() => navigate('/opportunities')}
            className="text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            Browse more
          </button>
        </div>
        {savedItems.length === 0 ? (
          <p className="mt-3 text-xs text-[#5E6B5B]">
            Save opportunities from the directory to keep them on your shortlist.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {savedItems.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-4 dark:border-[#232D27] dark:bg-[#0C110E]"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/opportunities/${opp.id}`)}
                    className="truncate text-left font-display text-sm font-bold text-[#101713] hover:underline dark:text-[#F7F7F0]"
                  >
                    {opp.title}
                  </button>
                  <p className="mt-0.5 font-mono text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                    Deadline {opp.deadline}
                  </p>
                </div>
                <VerificationStatusTag status={opp.verificationStatus} />
              </div>
            ))}
          </div>
        )}
      </div>        </>
      )}
    </div>
  );
}
