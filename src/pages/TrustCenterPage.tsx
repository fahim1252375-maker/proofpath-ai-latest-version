import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, CalendarClock, CheckCircle2, Clock3, ExternalLink, LoaderCircle, Radar, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { OpportunityItem } from '../types';

interface WatchlistItem extends OpportunityItem {
  savedAt: string;
  preferences: {
    notifyDeadlines: boolean;
    notifyChanges: boolean;
    deadlineDaysBefore: number;
  };
  recentChanges: Array<{
    id: string;
    change_type: string;
    title_before: string;
    title_after: string;
    excerpt_before: string;
    excerpt_after: string;
    detected_at: string;
  }>;
}

interface TrustSummary {
  watchlistCount: number;
  pendingSafetyReports: number;
  recentOpportunityChanges: number;
  monitoring: {
    configured: boolean;
    lastRun: null | {
      status: string;
      started_at: string;
      finished_at: string | null;
      checked_count: number;
      changed_count: number;
      error_count: number;
    };
  };
  delivery: { inApp: boolean };
}

interface EligibilityExplanation {
  status: string;
  scoreLabel: string;
  completeness: { provided: number; required: number; percentage: number };
  reasons: Array<{ criterion: string; status: string; detail: string }>;
  missingProfileFields: string[];
  recommendedNextSteps: string[];
  methodology?: string;
}

interface AdminTrustAnalytics {
  stats: Record<string, number>;
  recentSafetySignals: Array<{
    host: string;
    reports: number;
    uniqueReporters: number;
    pending: number;
    resolvedValid: number;
    dismissed: number;
    riskSignal: string;
    reasons: Record<string, number>;
  }>;
  recentChanges: Array<Record<string, unknown>>;
  latestMonitoringRun: Record<string, unknown> | null;
  monitoringConfigured: boolean;
  disclaimer: string;
}

export function TrustCenterPage({ navigate }: { navigate: (path: string) => void }) {
  const { user, addToast } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [summary, setSummary] = useState<TrustSummary | null>(null);
  const [analytics, setAnalytics] = useState<AdminTrustAnalytics | null>(null);
  const [explanations, setExplanations] = useState<Record<string, EligibilityExplanation>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [watchlist, trust] = await Promise.all([
        apiRequest<{ items: WatchlistItem[] }>('/api/watchlist'),
        apiRequest<TrustSummary>('/api/trust/summary'),
      ]);
      setItems(watchlist.items);
      setSummary(trust);
      if (user?.role === 'admin' || user?.role === 'moderator') {
        const adminData = await apiRequest<AdminTrustAnalytics>('/api/admin/trust-analytics');
        setAnalytics(adminData);
      } else {
        setAnalytics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Trust Center.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const updatePreferences = async (
    item: WatchlistItem,
    patch: Partial<WatchlistItem['preferences']>
  ) => {
    const preferences = { ...item.preferences, ...patch };
    setSavingId(item.id);
    try {
      await apiRequest('/api/watchlist/' + item.id + '/preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      setItems((previous) => previous.map((entry) =>
        entry.id === item.id ? { ...entry, preferences } : entry
      ));
      addToast({ type: 'success', title: 'Watchlist alerts updated' });
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Could not update alerts' });
    } finally {
      setSavingId(null);
    }
  };

  const showEligibility = async (opportunityId: string) => {
    if (expanded === opportunityId) {
      setExpanded(null);
      return;
    }
    setExpanded(opportunityId);
    if (explanations[opportunityId]) return;
    try {
      const result = await apiRequest<EligibilityExplanation>(
        '/api/eligibility/explain/' + opportunityId
      );
      setExplanations((previous) => ({ ...previous, [opportunityId]: result }));
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Eligibility explanation failed' });
    }
  };

  const adminNumber = (key: string) => analytics?.stats?.[key] ?? 0;

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading Trust Center…
      </div>
    );
  }

  return (
    <div className="pp-depth-page pp-depth-trust space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
            Trust, Alerts &amp; Evidence
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
            Trust Center
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
            Monitor saved opportunities, review page changes, and inspect eligibility decisions with their underlying criteria.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E4E8E0] px-3 py-2 text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh data
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B5B] dark:text-[#8C9A88]">
            <Bell className="h-4 w-4" /> Saved opportunities
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">{summary?.watchlistCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B5B] dark:text-[#8C9A88]">
            <CalendarClock className="h-4 w-4" /> Page changes (30 days)
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">{summary?.recentOpportunityChanges ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B5B] dark:text-[#8C9A88]">
            <ShieldAlert className="h-4 w-4" /> Your pending reports
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">{summary?.pendingSafetyReports ?? 0}</p>
        </div>
      </div>

      <section className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[#C5F36A]/20 p-2 text-[#101713] dark:text-[#C5F36A]">
            <Radar className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">Scheduled opportunity monitoring</h2>
            <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
              The monitor stores a baseline of each checked public page, detects later content changes, and creates in-app alerts for saved opportunities.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {summary?.monitoring.configured ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Secret configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <Clock3 className="h-3.5 w-3.5" /> Scheduler setup required
                </span>
              )}
              <span className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                In-app alerts available · Email delivery not configured
              </span>
            </div>
            {summary?.monitoring.lastRun ? (
              <p className="mt-3 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                Last run: {new Date(summary.monitoring.lastRun.started_at).toLocaleString()} · {summary.monitoring.lastRun.checked_count} pages checked · {summary.monitoring.lastRun.changed_count} changes · {summary.monitoring.lastRun.error_count} errors
              </p>
            ) : (
              <p className="mt-3 text-xs text-[#8C9A88]">No monitoring run has been recorded yet.</p>
            )}
            <p className="mt-2 text-xs text-[#8C9A88]">
              A page-content change is a review signal, not proof that its deadline, eligibility rules, or funding terms changed. Confirm details on the official provider page.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">Scholarship &amp; opportunity watchlist</h2>
            <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Manage deadline and page-change alerts for saved listings.</p>
          </div>
          <button type="button" onClick={() => navigate('/opportunities')} className="text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]">
            Browse opportunities
          </button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#C5CFC3] bg-white p-8 text-center dark:border-[#344139] dark:bg-[#141B17]">
            <Bell className="mx-auto h-7 w-7 text-[#8C9A88]" />
            <p className="mt-3 text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">Your watchlist is empty</p>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Save an opportunity from its detail page to enable deadline reminders and page-change tracking.</p>
            <button type="button" onClick={() => navigate('/opportunities')} className="mt-4 rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]">
              Explore directory
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const explanation = explanations[item.id];
              return (
                <article key={item.id} className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{item.title}</h3>
                      <p className="mt-0.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{item.organization} · {item.country}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded bg-[#F1F3ED] px-2 py-1 font-medium text-[#465246] dark:bg-[#202A23] dark:text-[#B8C4B4]">Deadline: {item.deadline}</span>
                        <span className="rounded bg-[#F1F3ED] px-2 py-1 font-medium text-[#465246] dark:bg-[#202A23] dark:text-[#B8C4B4]">{item.verificationStatus}</span>
                        <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline decoration-[#C5F36A] underline-offset-2">
                          Listed portal <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={savingId === item.id} onClick={() => updatePreferences(item, { notifyDeadlines: !item.preferences.notifyDeadlines })} className="rounded-lg border border-[#E4E8E0] px-3 py-2 text-[11px] font-semibold dark:border-[#344139]">
                        {item.preferences.notifyDeadlines ? 'Deadline alerts on' : 'Deadline alerts off'}
                      </button>
                      <button type="button" disabled={savingId === item.id} onClick={() => updatePreferences(item, { notifyChanges: !item.preferences.notifyChanges })} className="rounded-lg border border-[#E4E8E0] px-3 py-2 text-[11px] font-semibold dark:border-[#344139]">
                        {item.preferences.notifyChanges ? 'Change alerts on' : 'Change alerts off'}
                      </button>
                      <button type="button" onClick={() => showEligibility(item.id)} className="rounded-lg bg-[#101713] px-3 py-2 text-[11px] font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]">
                        {expanded === item.id ? 'Hide eligibility' : 'Explain eligibility'}
                      </button>
                      <label className="flex items-center gap-2 text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                        Reminder window
                        <select value={item.preferences.deadlineDaysBefore} disabled={savingId === item.id} onChange={(event) => updatePreferences(item, { deadlineDaysBefore: Number(event.target.value) })} className="rounded-md border border-[#E4E8E0] bg-white px-2 py-1.5 text-[11px] text-[#101713] dark:border-[#344139] dark:bg-[#0C110E] dark:text-[#F7F7F0]">
                          <option value={3}>3 days</option>
                          <option value={7}>7 days</option>
                          <option value={14}>14 days</option>
                          <option value={30}>30 days</option>
                          <option value={60}>60 days</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  {item.recentChanges.length > 0 && (
                    <div className="mt-3 border-t border-[#E4E8E0] pt-3 dark:border-[#232D27]">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5E6B5B] dark:text-[#8C9A88]">Recent page changes</p>
                      <ul className="mt-2 space-y-1.5">
                        {item.recentChanges.map((change) => (
                          <li key={change.id} className="text-xs text-[#5E6B5B] dark:text-[#A9B5A6]">
                            {change.title_before !== change.title_after ? change.title_before + ' → ' + change.title_after : 'Page content changed'} · {new Date(change.detected_at).toLocaleString()}
                            {(change.excerpt_before || change.excerpt_after) && (
                              <details className="mt-1">
                                <summary className="cursor-pointer font-semibold underline underline-offset-2">View text snapshot difference</summary>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <div><p className="font-mono text-[10px] uppercase">Previous text</p><p className="mt-1 whitespace-pre-wrap text-[11px]">{change.excerpt_before || 'No earlier excerpt stored.'}</p></div>
                                  <div><p className="font-mono text-[10px] uppercase">Latest text</p><p className="mt-1 whitespace-pre-wrap text-[11px]">{change.excerpt_after || 'No latest excerpt available.'}</p></div>
                                </div>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {expanded === item.id && (
                    <div className="mt-3 rounded-lg bg-[#F7F7F0] p-3 dark:bg-[#0C110E]">
                      {!explanation ? (
                        <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Loading eligibility explanation…</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">{explanation.scoreLabel} · {explanation.status}</p>
                            <p className="font-mono text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">Profile completeness {explanation.completeness.percentage}%</p>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#DDE3D8] dark:bg-[#26312A]">
                            <div className="h-full rounded-full bg-[#91B83A]" style={{ width: explanation.completeness.percentage + '%' }} />
                          </div>
                          {explanation.reasons.length > 0 ? (
                            <ul className="mt-3 space-y-2">
                              {explanation.reasons.map((reason, index) => (
                                <li key={index} className="text-xs">
                                  <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{reason.criterion}: {reason.status}</span>
                                  <p className="mt-0.5 text-[#5E6B5B] dark:text-[#8C9A88]">{reason.detail}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-[#5E6B5B]">Complete your profile to calculate criterion-level results.</p>
                          )}
                          {explanation.missingProfileFields.length > 0 && (
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Missing profile fields: {explanation.missingProfileFields.join(', ')}</p>
                          )}
                          <p className="mt-2 text-[10px] text-[#8C9A88]">{explanation.methodology || 'Missing information is not treated as a pass.'}</p>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {analytics && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#718C32]" />
            <h2 className="font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">Trust &amp; Safety operations</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Published opportunities', adminNumber('publishedOpportunities')],
              ['Watchlist links', adminNumber('savedOpportunityLinks')],
              ['Page changes', adminNumber('trackedChanges')],
              ['Open safety reports', adminNumber('unresolvedCommunityReports')],
              ['Evidence links', adminNumber('totalEvidenceLinks')],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-[#E4E8E0] bg-white p-3 dark:border-[#232D27] dark:bg-[#141B17]">
                <p className="font-mono text-xl font-bold">{value}</p>
                <p className="mt-1 text-[10px] text-[#5E6B5B] dark:text-[#8C9A88]">{label}</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-[#E4E8E0] bg-white dark:border-[#232D27] dark:bg-[#141B17]">
            <div className="border-b border-[#E4E8E0] px-4 py-3 dark:border-[#232D27]">
              <h3 className="text-sm font-semibold">Community report patterns by domain</h3>
              <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Pattern indicators help prioritize human review; they do not establish fraud.</p>
            </div>
            {analytics.recentSafetySignals.length === 0 ? (
              <p className="p-4 text-xs text-[#8C9A88]">No community reports have been recorded.</p>
            ) : (
              <div className="divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
                {analytics.recentSafetySignals.map((signal) => (
                  <div key={signal.host} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold">{signal.host}</p>
                      <p className="mt-0.5 text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">{signal.reports} reports · {signal.uniqueReporters} reporters · {signal.pending} pending</p>
                    </div>
                    <span className="rounded bg-[#F1F3ED] px-2 py-1 text-[10px] font-semibold dark:bg-[#202A23]">{signal.riskSignal}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="border-t border-[#E4E8E0] px-4 py-3 text-[11px] text-[#8C9A88] dark:border-[#232D27]">{analytics.disclaimer}</p>
          </div>
        </section>
      )}
    </div>
  );
}
