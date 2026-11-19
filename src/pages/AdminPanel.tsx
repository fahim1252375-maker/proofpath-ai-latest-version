import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { OpportunityItem, SafeUser, VerificationReport, VerificationStatus } from '../types';
import { DistributionRingChart, HorizontalBarChart } from '../components/charts/AnalyticsCharts';
import { ConfirmDialog, SkeletonBlock, VerificationStatusTag } from '../components/ui/Common';

interface AdminOverview {
  stats: {
    totalUsers: number;
    totalOpportunities: number;
    totalVerifications: number;
    pendingModReports: number;
    geminiConfigured: boolean;
  };
  verificationsByStatus: Array<{ status: string; count: number }>;
  aiStats: Array<{ feature: string; status: string; count: number; avg_latency_ms: number }>;
  opportunityCategories: Array<{ category: string; count: number }>;
  recentAudit: Array<{
    id: string;
    actor_email: string | null;
    action: string;
    target_type: string;
    target_id: string;
    created_at: string;
  }>;
}

export function AdminPanel() {
  const { user, addToast } = useAuth();
  const [tab, setTab] = useState<'overview' | 'users' | 'opportunities' | 'moderation' | 'verifications' | 'audit' | 'cms'>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [modReports, setModReports] = useState<Array<Record<string, unknown>>>([]);
  const [verifications, setVerifications] = useState<VerificationReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [aiLogs, setAiLogs] = useState<Array<Record<string, unknown>>>([]);
  const [cmsBanner, setCmsBanner] = useState({ headline: '', subheadline: '', trustBanner: '' });
  const [loading, setLoading] = useState(true);
  const [deleteOppTarget, setDeleteOppTarget] = useState<OpportunityItem | null>(null);
  const [publishReviewNotes, setPublishReviewNotes] = useState<Record<string, string>>({});

  // New Opportunity form
  const [newOppOpen, setNewOppOpen] = useState(false);
  const [oppForm, setOppForm] = useState({
    title: '',
    organization: '',
    country: '',
    category: 'scholarship',
    educationLevel: 'masters',
    fundingType: 'fully_funded',
    fundingAmount: '',
    deadline: '2027-06-01',
    officialUrl: 'https://',
    description: '',
  });

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    setLoading(true);
    try {
      const ov = await apiRequest<AdminOverview>('/api/admin/overview');
      setOverview(ov);

      const [oppsRes, modRes, verRes] = await Promise.all([
        apiRequest<{ items: OpportunityItem[] }>('/api/admin/opportunities'),
        apiRequest<{ items: Array<Record<string, unknown>> }>('/api/admin/community-reports'),
        apiRequest<{ items: VerificationReport[] }>('/api/admin/verifications'),
      ]);
      setOpportunities(oppsRes.items);
      setModReports(modRes.items);
      setVerifications(verRes.items);

      if (isAdmin) {
        const [usersRes, audRes, aiRes, cmsRes] = await Promise.all([
          apiRequest<{ items: SafeUser[] }>('/api/admin/users'),
          apiRequest<{ items: Array<Record<string, unknown>> }>('/api/admin/audit-logs'),
          apiRequest<{ items: Array<Record<string, unknown>> }>('/api/admin/ai-usage'),
          apiRequest<{ items: Array<{ key: string; value: typeof cmsBanner }> }>('/api/admin/content'),
        ]);
        setUsers(usersRes.items);
        setAuditLogs(audRes.items);
        setAiLogs(aiRes.items);
        const landing = cmsRes.items.find((c) => c.key === 'landing_announcement');
        if (landing) setCmsBanner(landing.value);
      }
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to load admin data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUserUpdate = async (userId: string, patch: { role?: string; isActive?: boolean }) => {
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      addToast({ type: 'success', title: 'User updated' });
      loadData();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Update failed' });
    }
  };

  const handleCreateOpp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/opportunities', {
        method: 'POST',
        body: JSON.stringify(oppForm),
      });
      setNewOppOpen(false);
      addToast({ type: 'success', title: 'Opportunity saved to the review queue as a draft' });
      loadData();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Create failed' });
    }
  };

  const handleOppStatus = async (id: string, verificationStatus: VerificationStatus) => {
    try {
      await apiRequest(`/api/admin/opportunities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ verificationStatus }),
      });
      addToast({ type: 'success', title: 'Opportunity review status updated' });
      loadData();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Review update failed' });
    }
  };

  const handleOppPublish = async (opportunity: OpportunityItem, reviewNote = '') => {
    const nextPublished = !opportunity.isPublished;
    if (nextPublished && opportunity.verificationStatus !== 'VERIFIED') {
      addToast({ type: 'error', title: 'Review the official source and mark this opportunity VERIFIED before publishing' });
      return;
    }
    if (nextPublished && reviewNote.trim().length < 10) {
      addToast({ type: 'error', title: 'Add a review note (at least 10 characters) before publishing' });
      return;
    }
    try {
      await apiRequest(`/api/admin/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isPublished: nextPublished,
          ...(nextPublished ? { reviewNote: reviewNote.trim() } : {}),
        }),
      });
      if (nextPublished) {
        setPublishReviewNotes((current) => ({ ...current, [opportunity.id]: '' }));
      }
      addToast({
        type: 'success',
        title: nextPublished ? 'Verified opportunity published' : 'Opportunity unpublished',
      });
      loadData();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Publication update failed' });
    }
  };

  const handleDeleteOpp = async () => {
    if (!deleteOppTarget) return;
    await apiRequest(`/api/admin/opportunities/${deleteOppTarget.id}`, { method: 'DELETE' });
    setDeleteOppTarget(null);
    addToast({ type: 'info', title: 'Opportunity deleted' });
    loadData();
  };

  const handleModerateReport = async (
    id: string,
    status: 'reviewing' | 'resolved_valid' | 'dismissed'
  ) => {
    await apiRequest(`/api/admin/community-reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        resolutionNotes: `Reviewed by ${user?.fullName} (${status})`,
      }),
    });
    addToast({ type: 'success', title: 'Moderation decision logged' });
    loadData();
  };

  const handleSaveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/content/landing_announcement', {
      method: 'PUT',
      body: JSON.stringify(cmsBanner),
    });
    addToast({ type: 'success', title: 'Public landing copy updated' });
  };

  if (loading || !overview) {
    return <SkeletonBlock className="h-96 rounded-xl" />;
  }

  return (
    <div className="pp-depth-page pp-depth-admin space-y-6">
      <div>
        <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
          Trust &amp; Governance Operations
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
          Enterprise Admin &amp; Moderation Console
        </h1>
        <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
          Role-protected operations for users, opportunity publishing, community safety moderation, and AI telemetry.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-[#E4E8E0] bg-white p-1.5 dark:border-[#232D27] dark:bg-[#141B17]">
        {[
          { id: 'overview', label: 'Overview' },
          ...(isAdmin ? [{ id: 'users', label: 'Users & Roles' }] : []),
          { id: 'opportunities', label: 'Opportunities CMS' },
          { id: 'moderation', label: `Moderation (${overview.stats.pendingModReports})` },
          { id: 'verifications', label: 'Verification Monitor' },
          ...(isAdmin ? [{ id: 'audit', label: 'Audit & AI Logs' }] : []),
          ...(isAdmin ? [{ id: 'cms', label: 'Site Content' }] : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                : 'text-[#5E6B5B] hover:bg-[#F7F7F0] dark:text-[#A9B5A6] dark:hover:bg-[#1D2520]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
              <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Registered Users</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                {overview.stats.totalUsers}
              </p>
            </div>
            <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
              <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Published Opportunities</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                {overview.stats.totalOpportunities}
              </p>
            </div>
            <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
              <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Verification Reports</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                {overview.stats.totalVerifications}
              </p>
            </div>
            <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
              <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">AI Engine Status</p>
              <p className="mt-2 text-sm font-bold text-[#101713] dark:text-[#C5F36A]">
                {overview.stats.geminiConfigured ? 'Gemini Configured' : 'API Key Missing'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DistributionRingChart
              title="Verification Verdicts Across Platform"
              data={overview.verificationsByStatus.map((v) => ({
                label: v.status,
                value: v.count,
                color:
                  v.status === 'VERIFIED'
                    ? '#16A34A'
                    : v.status === 'CONTRADICTED'
                    ? '#DC2626'
                    : v.status === 'SUPPORTED'
                    ? '#101713'
                    : '#D97706',
              }))}
            />
            <HorizontalBarChart
              title="Opportunities by Category"
              data={overview.opportunityCategories.map((c, idx) => ({
                label: c.category,
                value: c.count,
                color: ['#101713', '#16A34A', '#5E6B5B', '#D97706', '#0284C7'][idx % 5],
              }))}
            />
          </div>
        </div>
      )}

      {tab === 'users' && isAdmin && (
        <div className="overflow-x-auto rounded-xl border border-[#E4E8E0] bg-white dark:border-[#232D27] dark:bg-[#141B17]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-[#E4E8E0] bg-[#F7F7F0] dark:border-[#232D27] dark:bg-[#0C110E]">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-semibold">{u.fullName}</td>
                  <td className="px-4 py-3 text-[#5E6B5B] dark:text-[#8C9A88]">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={u.id === user?.id}
                      onChange={(e) => handleUserUpdate(u.id, { role: e.target.value })}
                      className="h-8 rounded border border-[#E4E8E0] bg-[#F7F7F0] px-2 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                    >
                      <option value="student">student</option>
                      <option value="moderator">moderator</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={u.id === user?.id}
                      onClick={() => handleUserUpdate(u.id, { isActive: !u.isActive })}
                      className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${
                        u.isActive
                          ? 'border-[#9ECF42] bg-[#C5F36A]/40 text-[#101713] dark:bg-[#C5F36A]/15 dark:text-[#C5F36A]'
                          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#5E6B5B] dark:text-[#8C9A88]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'opportunities' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setNewOppOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#101713] px-3.5 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Opportunity</span>
            </button>
          </div>

          {newOppOpen && (
            <form
              onSubmit={handleCreateOpp}
              className="grid grid-cols-1 gap-3 rounded-xl border border-[#E4E8E0] bg-white p-5 sm:grid-cols-2 dark:border-[#232D27] dark:bg-[#141B17]"
            >
              <p className="text-xs leading-relaxed text-[#5E6B5B] sm:col-span-2 dark:text-[#A9B5A6]" role="note">
                New listings are saved as unpublished drafts. Review the official source, mark the record VERIFIED, add a brief review note, then publish it. This is a manual review record, not automated source verification.
              </p>
              <input
                required
                placeholder="Opportunity Title"
                value={oppForm.title}
                onChange={(e) => setOppForm({ ...oppForm, title: e.target.value })}
                className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <input
                required
                placeholder="Organization"
                value={oppForm.organization}
                onChange={(e) => setOppForm({ ...oppForm, organization: e.target.value })}
                className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <input
                required
                placeholder="Country"
                value={oppForm.country}
                onChange={(e) => setOppForm({ ...oppForm, country: e.target.value })}
                className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <input
                required
                placeholder="Funding Amount (e.g. Full Tuition + Stipend)"
                value={oppForm.fundingAmount}
                onChange={(e) => setOppForm({ ...oppForm, fundingAmount: e.target.value })}
                className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <input
                required
                type="url"
                placeholder="Official URL"
                value={oppForm.officialUrl}
                onChange={(e) => setOppForm({ ...oppForm, officialUrl: e.target.value })}
                className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <input
                required
                type="date"
                value={oppForm.deadline}
                onChange={(e) => setOppForm({ ...oppForm, deadline: e.target.value })}
                className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <textarea
                required
                rows={2}
                placeholder="Program description..."
                value={oppForm.description}
                onChange={(e) => setOppForm({ ...oppForm, description: e.target.value })}
                className="rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-2.5 text-xs sm:col-span-2 dark:border-[#232D27] dark:bg-[#0C110E]"
              />
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setNewOppOpen(false)}
                  className="rounded-lg border border-[#E4E8E0] px-3 py-1.5 text-xs dark:border-[#232D27]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#101713] px-4 py-1.5 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
                >
                  Save Draft for Review
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-[#E4E8E0] bg-white dark:border-[#232D27] dark:bg-[#141B17]">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="border-b border-[#E4E8E0] bg-[#F7F7F0] dark:border-[#232D27] dark:bg-[#0C110E]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Country</th>
                  <th className="px-4 py-3 font-semibold">Deadline</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Publication</th>
                  {isAdmin && <th className="px-4 py-3 text-right font-semibold">Delete</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
                {opportunities.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-semibold">{o.title}</td>
                    <td className="px-4 py-3 text-[#5E6B5B] dark:text-[#8C9A88]">{o.country}</td>
                    <td className="px-4 py-3 font-mono">{o.deadline}</td>
                    <td className="px-4 py-3">
                      <select
                        value={o.verificationStatus}
                        onChange={(e) => handleOppStatus(o.id, e.target.value as VerificationStatus)}
                        className="h-8 rounded border border-[#E4E8E0] bg-[#F7F7F0] px-2 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                      >
                        <option value="VERIFIED">VERIFIED</option>
                        <option value="SUPPORTED">SUPPORTED</option>
                        <option value="UNVERIFIED">UNVERIFIED</option>
                        <option value="CONTRADICTED">CONTRADICTED</option>
                        <option value="EXPIRED">EXPIRED</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          o.isPublished
                            ? 'bg-[#C5F36A]/35 text-[#263A0C] dark:bg-[#C5F36A]/15 dark:text-[#C5F36A]'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}>
                          {o.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOppPublish(o, publishReviewNotes[o.id] || '')}
                          disabled={!o.isPublished && (
                            o.verificationStatus !== 'VERIFIED' ||
                            (publishReviewNotes[o.id] || '').trim().length < 10
                          )}
                          title={!o.isPublished && o.verificationStatus !== 'VERIFIED'
                            ? 'Mark VERIFIED after reviewing the official source before publishing.'
                            : !o.isPublished && (publishReviewNotes[o.id] || '').trim().length < 10
                              ? 'Add a review note of at least 10 characters before publishing.'
                            : o.isPublished ? 'Unpublish opportunity' : 'Publish verified opportunity'}
                          className="rounded border border-[#D6DED1] px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#344238]"
                        >
                          {o.isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                      </div>
                      {!o.isPublished && o.verificationStatus === 'VERIFIED' && (
                        <input
                          type="text"
                          aria-label={`Official source review note for ${o.title}`}
                          minLength={10}
                          maxLength={500}
                          value={publishReviewNotes[o.id] || ''}
                          onChange={(event) => setPublishReviewNotes((current) => ({
                            ...current,
                            [o.id]: event.target.value,
                          }))}
                          placeholder="Official source review note"
                          className="mt-2 h-8 w-full min-w-[180px] rounded border border-[#D6DED1] bg-transparent px-2 text-[10px] dark:border-[#344238]"
                        />
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteOppTarget(o)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="inline h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'moderation' && (
        <div className="space-y-3">
          {modReports.length === 0 ? (
            <p className="rounded-xl border border-[#E4E8E0] bg-white p-6 text-center text-xs text-[#5E6B5B] dark:border-[#232D27] dark:bg-[#141B17]">
              No community safety reports submitted yet.
            </p>
          ) : (
            modReports.map((r) => (
              <div
                key={String(r.id)}
                className="flex flex-col justify-between gap-4 rounded-xl border border-[#E4E8E0] bg-white p-5 sm:flex-row sm:items-center dark:border-[#232D27] dark:bg-[#141B17]"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">
                    {String(r.reason).toUpperCase()} · Status: {String(r.status)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                    {String(r.submitted_url)}
                  </p>
                  <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{String(r.details)}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleModerateReport(String(r.id), 'resolved_valid')}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Confirm Risk
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModerateReport(String(r.id), 'dismissed')}
                    className="rounded-lg border border-[#E4E8E0] px-3 py-1.5 text-xs font-semibold dark:border-[#232D27]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'verifications' && (
        <div className="overflow-x-auto rounded-xl border border-[#E4E8E0] bg-white dark:border-[#232D27] dark:bg-[#141B17]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-[#E4E8E0] bg-[#F7F7F0] dark:border-[#232D27] dark:bg-[#0C110E]">
              <tr>
                <th className="px-4 py-3 font-semibold">Submission</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Verdict</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
              {verifications.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 font-semibold">{v.extractedInfo.title}</td>
                  <td className="px-4 py-3 uppercase font-mono">{v.inputType}</td>
                  <td className="px-4 py-3">
                    <VerificationStatusTag status={v.overallStatus} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[#5E6B5B] dark:text-[#8C9A88]">
                    {new Date(v.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && isAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
            <h2 className="font-display text-sm font-bold">Security &amp; Admin Audit Log</h2>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto text-xs">
              {auditLogs.map((a) => (
                <div
                  key={String(a.id)}
                  className="flex justify-between gap-2 border-b border-[#E4E8E0] pb-2 dark:border-[#232D27]"
                >
                  <div>
                    <span className="font-mono font-semibold text-[#101713] dark:text-[#C5F36A]">
                      {String(a.action)}
                    </span>
                    <p className="text-[#5E6B5B] dark:text-[#8C9A88]">
                      {String(a.actor_email || 'system')} → {String(a.target_type)}:{String(a.target_id).slice(0, 14)}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#8C9A88]">
                    {new Date(String(a.created_at)).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
            <h2 className="font-display text-sm font-bold">AI Usage &amp; Latency Logs</h2>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto text-xs">
              {aiLogs.length === 0 ? (
                <p className="text-[#5E6B5B]">No AI requests logged yet.</p>
              ) : (
                aiLogs.map((l) => (
                  <div
                    key={String(l.id)}
                    className="flex justify-between gap-2 border-b border-[#E4E8E0] pb-2 dark:border-[#232D27]"
                  >
                    <div>
                      <span className="font-mono font-semibold">{String(l.feature)}</span> · {String(l.model)}
                      <p className={l.status === 'error' ? 'text-red-600' : 'text-emerald-700 dark:text-[#C5F36A]'}>
                        {String(l.status)} {l.error_message ? `— ${String(l.error_message)}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[#5E6B5B] tabular-nums">
                      {String(l.latency_ms)}ms
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'cms' && isAdmin && (
        <form
          onSubmit={handleSaveCms}
          className="max-w-2xl space-y-4 rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
        >
          <h2 className="font-display text-base font-bold">Landing Page Content Management</h2>
          <div>
            <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
              Hero Headline
            </label>
            <input
              type="text"
              required
              value={cmsBanner.headline}
              onChange={(e) => setCmsBanner({ ...cmsBanner, headline: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
              Hero Subheadline
            </label>
            <textarea
              required
              rows={3}
              value={cmsBanner.subheadline}
              onChange={(e) => setCmsBanner({ ...cmsBanner, subheadline: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
              Trust Banner Caption
            </label>
            <input
              type="text"
              required
              value={cmsBanner.trustBanner}
              onChange={(e) => setCmsBanner({ ...cmsBanner, trustBanner: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            Publish Content Changes
          </button>
        </form>
      )}

      <ConfirmDialog
        open={Boolean(deleteOppTarget)}
        title="Delete published opportunity?"
        message={`Permanently delete "${deleteOppTarget?.title}" from the catalog?`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteOpp}
        onCancel={() => setDeleteOppTarget(null)}
      />
    </div>
  );
}
