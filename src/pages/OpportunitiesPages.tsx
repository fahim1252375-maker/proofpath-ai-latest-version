import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Bot,
  ExternalLink,
  GitCompareArrows,
  Globe,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { buildComparisonRows, normalizeCompareSelection, NOT_PROVIDED } from '../lib/comparisonStudio';
import type { OpportunityItem, VerificationReport } from '../types';
import {
  EligibilityStatusTag,
  EmptyState,
  SkeletonBlock,
  VerificationStatusTag,
} from '../components/ui/Common';

export function OpportunitiesDirectoryPage({
  navigate,
  initialQuery = '',
  compareIds,
  onToggleCompare,
}: {
  navigate: (path: string) => void;
  initialQuery?: string;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
}) {
  const { user, addToast } = useAuth();
  const [q, setQ] = useState(initialQuery);
  const [category, setCategory] = useState('all');
  const [country, setCountry] = useState('all');
  const [educationLevel, setEducationLevel] = useState('all');
  const [fundingType, setFundingType] = useState('all');
  const [maxGpa, setMaxGpa] = useState('');
  const [deadlineBefore, setDeadlineBefore] = useState('');
  const [sort, setSort] = useState('deadline_asc');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        category,
        country,
        educationLevel,
        fundingType,
        sort,
        page: String(page),
        limit: '9',
      });
      if (maxGpa) params.set('maxGpa', maxGpa);
      if (deadlineBefore) params.set('deadlineBefore', deadlineBefore);

      const data = await apiRequest<{
        items: OpportunityItem[];
        total: number;
        totalPages: number;
        facets: { countries: string[] };
      }>(`/api/opportunities?${params.toString()}`);

      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCountries(data.facets.countries);
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to load opportunities' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, [category, country, educationLevel, fundingType, sort, page, maxGpa, deadlineBefore]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOpportunities();
  };

  const handleToggleSave = async (opp: OpportunityItem) => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      if (opp.isSaved) {
        await apiRequest(`/api/saved/${opp.id}`, { method: 'DELETE' });
        setItems((prev) => prev.map((i) => (i.id === opp.id ? { ...i, isSaved: false } : i)));
        addToast({ type: 'info', title: 'Removed from saved opportunities' });
      } else {
        await apiRequest(`/api/saved/${opp.id}`, { method: 'POST' });
        setItems((prev) => prev.map((i) => (i.id === opp.id ? { ...i, isSaved: true } : i)));
        addToast({ type: 'success', title: 'Saved to your workspace' });
      }
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to update saved state' });
    }
  };

  return (
    <div className="pp-depth-page pp-depth-opportunities space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
            Opportunity Directory
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
            Opportunity Directory
          </h1>
          <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
            Browse published records, check their stored status, and compare eligibility estimates. Confirm current details with each provider.
          </p>
        </div>

        {compareIds.length > 0 && (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <button
              type="button"
              disabled={compareIds.length < 2}
              onClick={() => navigate(`/compare?ids=${compareIds.join(',')}`)}
              title={
                compareIds.length < 2
                  ? 'Select at least two opportunities to compare'
                  : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              <GitCompareArrows className="h-4 w-4" />
              <span>Compare Selected ({compareIds.length})</span>
            </button>
            {compareIds.length < 2 && (
              <span className="text-[11px] font-medium text-[#5E6B5B] dark:text-[#8C9A88]">
                Select at least two opportunities to enable comparison.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#8C9A88]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by scholarship name, organization, country..."
              className="h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] pr-3 pl-9 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            >
              <option value="all">All Categories</option>
              <option value="scholarship">Scholarships</option>
              <option value="internship">Internships</option>
              <option value="fellowship">Fellowships</option>
              <option value="competition">Competitions</option>
              <option value="grant">Grants</option>
            </select>

            <select
              aria-label="Sort opportunities"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            >
              <option value="deadline_asc">Soonest Deadline</option>
              <option value="deadline_desc">Latest Deadline</option>
              <option value="verified_recent">Recently Verified</option>
              <option value="title_asc">Title A–Z</option>
            </select>

            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E4E8E0] px-3 text-sm font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
            </button>

            <button
              type="submit"
              className="h-10 rounded-lg bg-[#101713] px-4 text-sm font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              Search
            </button>
          </div>
        </form>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#E4E8E0] pt-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-[#232D27]">
            <div>
              <label className="block text-[11px] font-semibold text-[#5E6B5B]">Country / Region</label>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setPage(1);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              >
                <option value="all">All Countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#5E6B5B]">Education Level</label>
              <select
                value={educationLevel}
                onChange={(e) => {
                  setEducationLevel(e.target.value);
                  setPage(1);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              >
                <option value="all">All Levels</option>
                <option value="high_school">High School</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="masters">Master’s</option>
                <option value="phd">PhD / Research</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#5E6B5B]">Funding Coverage</label>
              <select
                value={fundingType}
                onChange={(e) => {
                  setFundingType(e.target.value);
                  setPage(1);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              >
                <option value="all">Any Funding</option>
                <option value="fully_funded">Fully Funded</option>
                <option value="partially_funded">Partially Funded</option>
                <option value="paid_stipend">Paid Stipend</option>
                <option value="prize_pool">Prize Pool</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#5E6B5B]">Your GPA (cutoff ≤)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="4"
                value={maxGpa}
                onChange={(e) => {
                  setMaxGpa(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. 3.5"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#5E6B5B]">Deadline Before</label>
              <input
                type="date"
                value={deadlineBefore}
                onChange={(e) => {
                  setDeadlineBefore(e.target.value);
                  setPage(1);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
        <span className="font-mono tabular-nums">Showing {items.length} of {total} opportunities</span>
        {(q || category !== 'all' || country !== 'all' || educationLevel !== 'all' || fundingType !== 'all' || maxGpa || deadlineBefore) && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setCategory('all');
              setCountry('all');
              setEducationLevel('all');
              setFundingType('all');
              setMaxGpa('');
              setDeadlineBefore('');
              setPage(1);
            }}
            className="font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#C5F36A]"
          >
            Reset all filters
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No matching opportunities"
          description="No records match the current filters. Clear filters or check back after reviewed listings are published."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((opp) => {
            const isCompared = compareIds.includes(opp.id);
            return (
              <article
                key={opp.id}
                className="flex flex-col justify-between rounded-xl border border-[#E4E8E0] bg-white p-5 transition-colors hover:border-[#101713] dark:border-[#232D27] dark:bg-[#141B17] dark:hover:border-[#C5F36A]/60"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                    <span className="capitalize">
                      {opp.category} · {opp.country}
                    </span>
                    <VerificationStatusTag status={opp.verificationStatus} />
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/opportunities/${opp.id}`)}
                    className="mt-3 block text-left font-display text-base font-bold text-[#101713] hover:underline dark:text-[#F7F7F0]"
                  >
                    {opp.title}
                  </button>
                  <p className="mt-1 text-xs font-medium text-[#5E6B5B] dark:text-[#8C9A88]">
                    {opp.organization}
                  </p>
                  <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[#5E6B5B] dark:text-[#A9B5A6]">
                    {opp.description}
                  </p>
                </div>

                <div className="mt-4 space-y-2.5 border-t border-[#E4E8E0] pt-3 dark:border-[#232D27]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Funding</span>
                    <span className="max-w-[190px] truncate font-semibold text-[#101713] dark:text-[#F7F7F0]">
                      {opp.fundingAmount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Deadline</span>
                    <span className="font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                      {opp.deadline}
                      {opp.matchIntelligence?.daysRemaining !== null &&
                        opp.matchIntelligence?.daysRemaining !== undefined && (
                          <span className="ml-1.5 text-[11px] text-[#5E6B5B] dark:text-[#C5F36A]">
                            ({opp.matchIntelligence.deadlineUrgency})
                          </span>
                        )}
                    </span>
                  </div>

                  {opp.matchIntelligence && opp.matchIntelligence.fundingCompatibility !== 'Unspecified' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Funding Fit</span>
                      <span className="font-mono font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {opp.matchIntelligence.fundingCompatibility}
                      </span>
                    </div>
                  )}

                  {opp.eligibility && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Your Match</span>
                      <EligibilityStatusTag status={opp.eligibility.status} />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/opportunities/${opp.id}`)}
                      className="flex-1 rounded-lg border border-[#E4E8E0] py-1.5 text-center text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleCompare(opp.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        isCompared
                          ? 'border-[#101713] bg-[#C5F36A] text-[#101713]'
                          : 'border-[#E4E8E0] text-[#5E6B5B] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#A9B5A6] dark:hover:bg-[#1D2520]'
                      }`}
                    >
                      {isCompared ? 'Compared' : 'Compare'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSave(opp)}
                      aria-label={opp.isSaved ? 'Unsave opportunity' : 'Save opportunity'}
                      className={`rounded-lg border p-1.5 ${
                        opp.isSaved
                          ? 'border-[#101713] bg-[#101713] text-[#C5F36A] dark:border-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                          : 'border-[#E4E8E0] text-[#5E6B5B] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#A9B5A6] dark:hover:bg-[#1D2520]'
                      }`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[#E4E8E0] px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-[#232D27]"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-[#E4E8E0] px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-[#232D27]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function OpportunityDetailPage({
  id,
  navigate,
}: {
  id: string;
  navigate: (path: string) => void;
}) {
  const { user, addToast } = useAuth();
  const [opp, setOpp] = useState<OpportunityItem | null>(null);
  const [verificationHistory, setVerificationHistory] = useState<VerificationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ opportunity: OpportunityItem; verificationHistory?: VerificationReport[] }>(
      `/api/opportunities/${id}`
    )
      .then((res) => {
        setOpp(res.opportunity);
        setVerificationHistory(res.verificationHistory || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Opportunity not found'))
      .finally(() => setLoading(false));
  }, [id, user?.id]);

  const handleTrackApplication = async () => {
    if (!opp) return;
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await apiRequest('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          opportunityId: opp.id,
          customTitle: opp.title,
          organization: opp.organization,
          status: 'researching',
          deadline: opp.deadline,
          priority: 'high',
        }),
      });
      addToast({ type: 'success', title: 'Added to Application Tracker' });
      navigate('/dashboard/applications');
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Could not create application' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-10 w-1/2" />
        <SkeletonBlock className="h-64" />
      </div>
    );
  }

  if (error || !opp) {
    return (
      <EmptyState
        icon={<Search className="h-5 w-5" />}
        title="Opportunity not found"
        description={error || 'The requested program could not be loaded.'}
        action={
          <button
            type="button"
            onClick={() => navigate('/opportunities')}
            className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            Back to Directory
          </button>
        }
      />
    );
  }

  const mi = opp.matchIntelligence;
  const tp = opp.trustProfile;

  return (
    <div className="pp-depth-page pp-depth-opportunity-detail space-y-6">
      <button
        type="button"
        onClick={() => navigate('/opportunities')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5E6B5B] hover:text-[#101713] dark:text-[#8C9A88] dark:hover:text-[#F7F7F0]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Opportunities</span>
      </button>

      <div className="rounded-2xl border border-[#E4E8E0] bg-white p-6 sm:p-8 dark:border-[#232D27] dark:bg-[#141B17]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E4E8E0] pb-6 sm:flex-row sm:items-start dark:border-[#232D27]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              <span className="capitalize">{opp.category}</span>
              <span aria-hidden="true">·</span>
              <span>{opp.country}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{opp.educationLevel.replace('_', ' ')}</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
              {opp.title}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#5E6B5B] dark:text-[#A9B5A6]">
              {opp.organization}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <VerificationStatusTag status={opp.verificationStatus} />
            {opp.eligibility && <EligibilityStatusTag status={opp.eligibility.status} />}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <div>
              <h2 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">Overview</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5E6B5B] dark:text-[#A9B5A6]">
                {opp.description}
              </p>
            </div>

            {/* Opportunity Match Intelligence */}
            {mi && (
              <div className="rounded-xl border border-[#232D27] bg-[#101713] p-5 text-[#F7F7F0]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-mono text-xs font-semibold tracking-wider text-[#C5F36A] uppercase">
                    Opportunity Match Intelligence
                  </h2>
                  <span className="font-mono text-xs text-[#A9B5A6]">
                    {mi.deadlineUrgency}
                    {mi.daysRemaining !== null ? ` · ${mi.daysRemaining}d remaining` : ''}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#D5DDD2]">{mi.explanation}</p>
                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#232D27] pt-3 sm:grid-cols-3 text-xs">
                  <div>
                    <p className="text-[11px] text-[#8C9A88]">Funding Fit</p>
                    <p className="mt-0.5 font-semibold text-[#C5F36A]">{mi.fundingCompatibility}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#8C9A88]">Academic Compatibility</p>
                    <p className="mt-0.5 font-semibold text-[#F7F7F0]">{mi.academicCompatibility}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#8C9A88]">Missing Attributes</p>
                    <p className="mt-0.5 font-semibold text-[#F7F7F0]">
                      {mi.missingRequirements.length > 0 ? mi.missingRequirements.join(', ') : 'None'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h2 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">
                Key Requirements &amp; Safety Notes
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[#5E6B5B] dark:text-[#A9B5A6]">
                {opp.requirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
            </div>

            {opp.eligibility && (
              <div className="rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-5 dark:border-[#232D27] dark:bg-[#0C110E]">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">
                    Your Personalized Eligibility Breakdown
                  </h2>
                  <span className="font-mono text-xs text-[#5E6B5B] dark:text-[#C5F36A]">
                    {opp.eligibility.scoreLabel}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {opp.eligibility.reasons.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-4 border-b border-[#E4E8E0] pb-2 text-xs last:border-0 dark:border-[#232D27]"
                    >
                      <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{r.criterion}</span>
                      <span className="flex-1 text-right text-[#5E6B5B] dark:text-[#A9B5A6]">
                        [{r.status.toUpperCase()}] {r.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Verification Audits Linked to Program */}
            {verificationHistory.length > 0 && (
              <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#0C110E]">
                <h2 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">
                  Linked Verification Audits ({verificationHistory.length})
                </h2>
                <div className="mt-3 divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
                  {verificationHistory.map((rep) => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => navigate(`/verify?report=${rep.id}`)}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-xs hover:underline"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#101713] dark:text-[#F7F7F0]">
                          {rep.extractedInfo.title}
                        </p>
                        <p className="font-mono text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                          {new Date(rep.createdAt).toLocaleDateString()} · {rep.evidenceSources.length} sources
                        </p>
                      </div>
                      <VerificationStatusTag status={rep.overallStatus} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-4">
            <div className="space-y-3 rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]">
              <div className="flex justify-between gap-2">
                <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Funding</span>
                <span className="text-right font-semibold text-[#101713] dark:text-[#F7F7F0]">{opp.fundingAmount}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Deadline</span>
                <span className="font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                  {opp.deadline}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Min GPA</span>
                <span className="font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                  {opp.minGpa ? `${opp.minGpa.toFixed(2)} / 4.00` : 'No fixed cutoff'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5E6B5B] dark:text-[#8C9A88]">English</span>
                <span className="text-right font-medium text-[#101713] dark:text-[#F7F7F0]">
                  {opp.englishReq || 'Not specified'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Last source review</span>
                <span className="font-mono text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                  {opp.verificationStatus === 'UNVERIFIED' || opp.verificationStatus === 'INSUFFICIENT_EVIDENCE'
                    ? 'Not yet reviewed'
                    : new Date(opp.lastVerifiedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Opportunity Trust Profile */}
            {tp && (
              <div className="space-y-2.5 rounded-xl border border-[#E4E8E0] bg-white p-5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]">
                <h2 className="flex items-center gap-1.5 font-display text-xs font-bold text-[#101713] uppercase dark:text-[#C5F36A]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Opportunity Trust Profile</span>
                </h2>
                <div className="flex justify-between gap-2">
                  <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Listed Domain</span>
                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#101713] dark:text-[#F7F7F0]">
                    <Globe className="h-3 w-3" />
                    {tp.officialDomain}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Domain Signal</span>
                  <span className="text-right font-medium text-[#101713] dark:text-[#F7F7F0]">
                    {tp.domainClassification}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Audits / Evidence Links / Reports</span>
                  <span className="font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                    {tp.verificationHistoryCount} / {tp.evidenceSourcesCount} / {tp.communityFlagCount}
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed text-[#788473] dark:text-[#8C9A88]">
                  Domain suffixes are technical signals only; they do not independently prove ownership, accreditation, or endorsement.
                </p>
                <p className="border-t border-[#E4E8E0] pt-2 text-[11px] leading-relaxed text-[#5E6B5B] dark:border-[#232D27] dark:text-[#8C9A88]">
                  {tp.riskSummary}
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              <a
                href={opp.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#101713] text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
              >
                <span>Open Listed Portal</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <button
                type="button"
                onClick={handleTrackApplication}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#E4E8E0] text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Track in Application Pipeline</span>
              </button>

              <button
                type="button"
                onClick={() => navigate(`/verify?url=${encodeURIComponent(opp.officialUrl)}`)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#E4E8E0] text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
              >
                <span>Re-Verify Live URL</span>
              </button>

              {user && (
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/assistant?opportunityId=${opp.id}`)}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#E4E8E0] text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>Ask AI Advisor (EN / বাংলা)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareOpportunitiesPage({
  compareIds,
  onClearCompare,
  navigate,
}: {
  compareIds: string[];
  onClearCompare: () => void;
  navigate: (path: string) => void;
}) {
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [allOptions, setAllOptions] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const idsToFetch = compareIds.length > 0 ? compareIds : [];
    Promise.all([
      idsToFetch.length
        ? apiRequest<{ items: OpportunityItem[] }>(`/api/opportunities/compare?ids=${idsToFetch.join(',')}`)
        : Promise.resolve<{ items: OpportunityItem[] }>({ items: [] }),
      apiRequest<{ items: OpportunityItem[] }>('/api/opportunities?limit=20'),
    ])
      .then(([cmp, all]) => {
        // No auto-fill: an empty selection stays empty (owner decision).
        setItems(cmp.items);
        setAllOptions(all.items);
      })
      .finally(() => setLoading(false));
  }, [compareIds.join(',')]);

  const toggleItem = (opp: OpportunityItem) => {
    setItems((prev) => {
      if (prev.some((p) => p.id === opp.id)) {
        return prev.filter((p) => p.id !== opp.id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, opp];
    });
  };

  const selection = normalizeCompareSelection(items.map((o) => o.id));
  const selectionOk = selection.ok;
  const rows = selectionOk ? buildComparisonRows(items) : [];

  return (
    <div className="pp-depth-page pp-depth-compare space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
            Decision Matrix
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
            Compare Opportunities Side-by-Side
          </h1>
          <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
            Evaluate funding coverage, GPA cutoffs, deadline urgency, and verification states across up to four programs.
          </p>
        </div>
        {compareIds.length > 0 && (
          <button
            type="button"
            onClick={onClearCompare}
            className="text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#C5F36A]"
          >
            Clear selection
          </button>
        )}
      </div>

      {allOptions.length > 0 && (
        <div className="pp-depth-card flex flex-wrap gap-2 rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
          {allOptions.slice(0, 8).map((opt) => {
            const active = items.some((i) => i.id === opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleItem(opt)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-[#101713] bg-[#C5F36A] text-[#101713]'
                    : 'border-[#E4E8E0] text-[#5E6B5B] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#A9B5A6] dark:hover:bg-[#1D2520]'
                }`}
              >
                {opt.title}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <SkeletonBlock className="h-80 rounded-xl" />
      ) : allOptions.length === 0 ? (
        <EmptyState
          icon={<GitCompareArrows className="h-5 w-5" />}
          title="No published opportunities to compare yet"
          description="The directory has no opportunity records available for comparison right now. Check the catalogue again when records are published."
          action={
            <button
              type="button"
              onClick={() => navigate('/opportunities')}
              className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A]"
            >
              Browse Directory
            </button>
          }
        />
      ) : !selectionOk ? (
        <EmptyState
          icon={<GitCompareArrows className="h-5 w-5" />}
          title="Select at least two opportunities to compare"
          description={
            items.length === 0
              ? 'No example records are shown — pick two to four programs above or from the Opportunity Directory.'
              : `You have selected ${items.length} record(s). One more is needed before the comparison can be built.`
          }
          action={
            <button
              type="button"
              onClick={() => navigate('/opportunities')}
              className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A]"
            >
              Browse Directory
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E4E8E0] bg-white dark:border-[#232D27] dark:bg-[#141B17]">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-[#E4E8E0] bg-[#F7F7F0] text-xs dark:border-[#232D27] dark:bg-[#0C110E]">
              <tr>
                <th className="w-44 px-4 py-3 font-semibold text-[#5E6B5B] dark:text-[#8C9A88]">Criterion</th>
                {items.map((o) => (
                  <th key={o.id} className="px-4 py-3 font-bold text-[#101713] dark:text-[#F7F7F0]">
                    <button
                      type="button"
                      onClick={() => navigate(`/opportunities/${o.id}`)}
                      className="text-left hover:underline"
                    >
                      {o.title}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E8E0] text-xs dark:divide-[#232D27]">
              {rows.map((row) => (
                <tr key={row.criterion}>
                  <td className="px-4 py-3 font-medium text-[#5E6B5B]">{row.criterion}</td>
                  {row.cells.map((cell) => {
                    const isLink = row.criterion === 'Official source' && cell.value !== NOT_PROVIDED;
                    const isDate = row.criterion === 'Last verified' && cell.value !== NOT_PROVIDED;
                    const display = isDate && !Number.isNaN(new Date(cell.value).getTime())
                      ? new Date(cell.value).toLocaleDateString()
                      : cell.value;
                    return (
                      <td key={cell.recordId} className="px-4 py-3 align-top">
                        {isLink ? (
                          <a
                            href={cell.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#C5F36A]"
                          >
                            Open official page
                            <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span
                            className={`text-[#101713] dark:text-[#F7F7F0] ${
                              cell.value === NOT_PROVIDED ? 'text-[#8C9A88] italic dark:text-[#A9B5A6]' : ''
                            }`}
                          >
                            {display}
                          </span>
                        )}
                        <span
                          className="mt-0.5 block font-mono text-[9px] text-[#8C9A88] dark:text-[#A9B5A6]"
                          title={`${cell.source} (record ${cell.recordId})`}
                        >
                          {cell.source}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
