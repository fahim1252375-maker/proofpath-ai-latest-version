import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Kanban,
  ListChecks,
  List,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  canTransition,
  focusActions,
  isOverdue,
  transitionBlockReason,
} from '../lib/applicationWorkflow';
import type { ApplicationItem } from '../types';
import { ConfirmDialog, EmptyState, SkeletonBlock } from '../components/ui/Common';

const STAGES: Array<{ id: ApplicationItem['status']; label: string }> = [
  { id: 'researching', label: 'Researching' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'interview', label: 'Interview' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
];

function computeReadiness(app: ApplicationItem) {
  const totalChecklist = app.checklist.length;
  const doneChecklist = app.checklist.filter((c) => c.done).length;
  const totalDocs = app.documents.length;
  const readyDocs = app.documents.filter((d) => d.isReady).length;
  const totalItems = totalChecklist + totalDocs;
  const completedItems = doneChecklist + readyDocs;
  const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const missingDocs = totalDocs - readyDocs;
  const pendingSteps = totalChecklist - doneChecklist;
  return { totalChecklist, doneChecklist, totalDocs, readyDocs, percent, missingDocs, pendingSteps };
}

export function daysUntilDeadline(deadline: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline || '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as unknown as [number, number, number, number];
  const due = new Date(year, month - 1, day);
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function ApplicationsPage() {
  const { addToast } = useAuth();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list' | 'calendar'>('kanban');
  const [focusMode, setFocusMode] = useState(false);
  const [quickFilter, setQuickFilter] = useState<'all' | 'needs_action' | 'due_soon'>('all');
  const [selected, setSelected] = useState<ApplicationItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApplicationItem | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newDeadline, setNewDeadline] = useState('2027-01-15');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');

  // Document add inside selected modal
  const [newDocName, setNewDocName] = useState('');
  const [newChecklistLabel, setNewChecklistLabel] = useState('');

  const loadApplications = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: ApplicationItem[] }>('/api/applications');
      setItems(data.items);
      if (selected) {
        const refreshed = data.items.find((i) => i.id === selected.id) || null;
        setSelected(refreshed);
      }
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to load applications' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          customTitle: newTitle,
          organization: newOrg,
          deadline: newDeadline,
          priority: newPriority,
          status: 'researching',
        }),
      });
      setCreateOpen(false);
      setNewTitle('');
      setNewOrg('');
      addToast({ type: 'success', title: 'Application created' });
      loadApplications();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Create failed' });
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<{
      status: ApplicationItem['status'];
      notes: string;
      deadline: string;
      priority: 'high' | 'medium' | 'low';
      checklist: ApplicationItem['checklist'];
    }>
  ) => {
    try {
      await apiRequest(`/api/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadApplications();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Update failed' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/applications/${deleteTarget.id}`, { method: 'DELETE' });
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      addToast({ type: 'info', title: 'Application removed' });
      loadApplications();
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Delete failed' });
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !newDocName.trim()) return;
    await apiRequest(`/api/applications/${selected.id}/documents`, {
      method: 'POST',
      body: JSON.stringify({ docName: newDocName.trim(), docType: 'required', isReady: false }),
    });
    setNewDocName('');
    loadApplications();
  };

  const handleToggleDoc = async (docId: string, current: boolean) => {
    if (!selected) return;
    await apiRequest(`/api/applications/${selected.id}/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isReady: !current }),
    });
    loadApplications();
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selected) return;
    await apiRequest(`/api/applications/${selected.id}/documents/${docId}`, { method: 'DELETE' });
    loadApplications();
  };

  // Readiness aggregate across applications
  const readinessTotals = items.reduce(
    (acc, app) => {
      const r = computeReadiness(app);
      acc.docsReady += r.readyDocs;
      acc.docsTotal += r.totalDocs;
      acc.stepsDone += r.doneChecklist;
      acc.stepsTotal += r.totalChecklist;
      return acc;
    },
    { docsReady: 0, docsTotal: 0, stepsDone: 0, stepsTotal: 0 }
  );
  const overallReadinessPct =
    readinessTotals.docsTotal + readinessTotals.stepsTotal > 0
      ? Math.round(
          ((readinessTotals.docsReady + readinessTotals.stepsDone) /
            (readinessTotals.docsTotal + readinessTotals.stepsTotal)) *
            100
        )
      : 0;

  const activeApplications = items.filter((app) => app.status !== 'accepted' && app.status !== 'rejected');
  const focus = focusMode
    ? focusActions(
        items.map((app) => ({
          id: app.id,
          title: app.customTitle,
          status: app.status,
          deadline: app.deadline,
          checklist: app.checklist,
        }))
      )
    : [];
  const needsActionItems = activeApplications.filter((app) => {
    const readiness = computeReadiness(app);
    return readiness.pendingSteps > 0 || readiness.missingDocs > 0;
  });
  const dueSoonItems = activeApplications.filter((app) => {
    const days = daysUntilDeadline(app.deadline);
    return days !== null && days >= 0 && days <= 14;
  });
  const visibleItems = quickFilter === 'needs_action'
    ? needsActionItems
    : quickFilter === 'due_soon'
      ? dueSoonItems
      : items;

  const byMonth = visibleItems.reduce<Record<string, ApplicationItem[]>>((acc, app) => {
    const key = app.deadline.slice(0, 7) || 'Unscheduled';
    acc[key] = acc[key] || [];
    acc[key].push(app);
    return acc;
  }, {});

  const calYear = calendarMonth.getFullYear();
  const calMon = calendarMonth.getMonth();
  const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
  const firstWeekday = new Date(calYear, calMon, 1).getDay();
  const monthPrefix = `${calYear}-${String(calMon + 1).padStart(2, '0')}`;

  return (
    <div className="pp-depth-page pp-depth-applications space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
            Application Intelligence
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
            Application Management Pipeline
          </h1>
          <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
            Organize deadlines, document readiness checklists, and stage history across Board, List, and Calendar views.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[#E4E8E0]/60 p-1 dark:bg-[#1D2520]">
            {[
              { id: 'kanban', label: 'Board', icon: <Kanban className="h-3.5 w-3.5" /> },
              { id: 'list', label: 'List', icon: <List className="h-3.5 w-3.5" /> },
              { id: 'calendar', label: 'Calendar', icon: <Calendar className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id as typeof view)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === tab.id
                    ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                    : 'text-[#5E6B5B] hover:text-[#101713] dark:text-[#8C9A88] dark:hover:text-[#F7F7F0]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFocusMode((mode) => !mode)}
            aria-pressed={focusMode}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              focusMode
                ? 'bg-[#C5F36A] text-[#101713] hover:bg-[#b5e458]'
                : 'border border-[#E4E8E0] text-[#101713] hover:bg-[#F7F7F0] dark:border-[#2C3730] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]'
            }`}
          >
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            <span>{focusMode ? 'Exit Focus Mode' : 'Focus Mode'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#101713] px-3.5 py-2 text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Application</span>
          </button>
        </div>
      </div>

      {/* Application Readiness Summary Strip */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E4E8E0] bg-white p-4 sm:grid-cols-3 dark:border-[#232D27] dark:bg-[#141B17]">
          <div>
            <p className="text-[11px] font-semibold text-[#5E6B5B] uppercase dark:text-[#8C9A88]">
              Pipeline Readiness
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="font-mono text-2xl font-bold text-[#101713] tabular-nums dark:text-[#C5F36A]">
                {overallReadinessPct}%
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-[#E4E8E0] dark:bg-[#232D27]">
                <div
                  className="h-full bg-[#101713] dark:bg-[#C5F36A]"
                  style={{ width: `${overallReadinessPct}%` }}
                />
              </div>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#5E6B5B] uppercase dark:text-[#8C9A88]">
              Document Checklists
            </p>
            <p className="mt-1.5 font-mono text-lg font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
              {readinessTotals.docsReady} / {readinessTotals.docsTotal} Ready
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#5E6B5B] uppercase dark:text-[#8C9A88]">
              Action Steps Completed
            </p>
            <p className="mt-1.5 font-mono text-lg font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
              {readinessTotals.stepsDone} / {readinessTotals.stepsTotal} Done
            </p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-[#E4E8E0] bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#232D27] dark:bg-[#141B17]" aria-label="Application quick filters">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
              <Filter className="h-3.5 w-3.5 text-[#65765F] dark:text-[#C5F36A]" aria-hidden="true" />
              Quick focus
            </p>
            <p className="mt-1 text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">Filter every view using your real checklist and deadline data.</p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter tracked applications">
            {[
              { id: 'all', label: 'All applications', count: items.length, icon: null },
              { id: 'needs_action', label: 'Needs action', count: needsActionItems.length, icon: <ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> },
              { id: 'due_soon', label: 'Due in 14 days', count: dueSoonItems.length, icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={quickFilter === option.id}
                onClick={() => setQuickFilter(option.id as typeof quickFilter)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8BB65A] ${
                  quickFilter === option.id
                    ? 'border-[#101713] bg-[#101713] text-[#C5F36A] dark:border-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                    : 'border-[#E4E8E0] bg-[#F7F7F0] text-[#40513A] hover:border-[#9BB58D] dark:border-[#2C3730] dark:bg-[#0C110E] dark:text-[#D5DDD2]'
                }`}
              >
                {option.icon}
                {option.label}
                <span className="rounded-md bg-black/5 px-1.5 py-0.5 font-mono tabular-nums dark:bg-white/10">{option.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <SkeletonBlock className="h-80 rounded-xl" />
      ) : focusMode ? (
        <section aria-label="Focus Mode — next actions" className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
          <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
            Focus Mode — your next three actions
          </h2>
          {focus.length === 0 ? (
            <p className="mt-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              No open actions right now. Track an application or add checklist steps to see actions here.
            </p>
          ) : (
            <>
              {focus.some((a) => a.kind === 'deadline') && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5E6B5B] dark:text-[#8C9A88]">
                    Deadline actions
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {focus.filter((a) => a.kind === 'deadline').map((action) => (
                      <li key={`deadline-${action.applicationId}`}>
                        <button
                          type="button"
                          onClick={() => setSelected(items.find((i) => i.id === action.applicationId) || null)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 py-2 text-left text-xs hover:border-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:hover:border-[#C5F36A]"
                        >
                          <span>
                            <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{action.applicationTitle}</span>
                            <span className="ml-2 text-[#5E6B5B] dark:text-[#8C9A88]">{action.label}</span>
                          </span>
                          <span className="font-mono text-[11px] text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">{action.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {focus.some((a) => a.kind === 'checklist') && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5E6B5B] dark:text-[#8C9A88]">
                    Checklist steps
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {focus.filter((a) => a.kind === 'checklist').map((action) => (
                      <li key={`checklist-${action.applicationId}-${action.label}`}>
                        <button
                          type="button"
                          onClick={() => setSelected(items.find((i) => i.id === action.applicationId) || null)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 py-2 text-left text-xs hover:border-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:hover:border-[#C5F36A]"
                        >
                          <span>
                            <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{action.applicationTitle}</span>
                            <span className="ml-2 text-[#5E6B5B] dark:text-[#8C9A88]">{action.label}</span>
                          </span>
                          <span className="font-mono text-[11px] text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">{action.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Kanban className="h-5 w-5" />}
          title="No tracked applications yet"
          description="Add a scholarship, internship, or fellowship to track document checklists and deadline reminders."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A]"
            >
              Track First Application
            </button>
          }
        />
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#C9D5C2] bg-white p-8 text-center dark:border-[#344438] dark:bg-[#141B17]">
          <p className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">Nothing needs attention in this view.</p>
          <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Try another filter or return to your full application pipeline.</p>
          <button type="button" onClick={() => setQuickFilter('all')} className="mt-4 rounded-lg bg-[#101713] px-3.5 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]">
            Show all applications
          </button>
        </div>
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-1 gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const stageApps = visibleItems.filter((i) => i.status === stage.id);
            return (
              <div
                key={stage.id}
                className="flex min-h-[260px] flex-col rounded-xl border border-[#E4E8E0] bg-[#EFEFE7] p-3 dark:border-[#232D27] dark:bg-[#141B17]"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
                    {stage.label}
                  </span>
                  <span className="font-mono text-xs text-[#5E6B5B] tabular-nums dark:text-[#C5F36A]">
                    {stageApps.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {stageApps.map((app) => {
                    const r = computeReadiness(app);
                    const overdue = isOverdue(app.deadline, app.status);
                    return (
                      <div
                        key={app.id}
                        className="rounded-lg border border-[#E4E8E0] bg-white p-3 dark:border-[#232D27] dark:bg-[#0C110E]"
                      >
                        <button
                          type="button"
                          onClick={() => setSelected(app)}
                          className="text-left text-xs font-bold text-[#101713] hover:underline dark:text-[#F7F7F0]"
                        >
                          {app.customTitle}
                        </button>
                        <p className="mt-1 truncate text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                          {app.organization}
                        </p>
                        {overdue && (
                          <p className="mt-1 text-[10px] font-bold text-red-700 dark:text-red-400" role="status">
                            Overdue — deadline has passed
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">
                          <span>{app.deadline}</span>
                          <span>{r.percent}% ready</span>
                        </div>
                        {r.missingDocs > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span>{r.missingDocs} missing doc(s)</span>
                          </p>
                        )}
                        <select
                          aria-label={`Change stage for ${app.customTitle}`}
                          value={app.status}
                          onChange={(e) =>
                            handleUpdate(app.id, { status: e.target.value as ApplicationItem['status'] })
                          }
                          className="mt-2 h-7 w-full rounded border border-[#E4E8E0] bg-[#F7F7F0] px-1.5 text-[11px] dark:border-[#232D27] dark:bg-[#141B17]"
                        >
                          {STAGES.map((s) => (
                            <option
                              key={s.id}
                              value={s.id}
                              disabled={!canTransition(app.status, s.id)}
                              title={transitionBlockReason(app.status, s.id) ?? undefined}
                            >
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          const blockedStage = STAGES.find(
                            (s) => s.id !== app.status && !canTransition(app.status, s.id)
                          );
                          if (!blockedStage) return null;
                          const reason = transitionBlockReason(app.status, blockedStage.id);
                          return reason ? (
                            <p className="mt-1 text-[10px] text-[#71806E] dark:text-[#8C9A88]">{reason}</p>
                          ) : null;
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-[#E4E8E0] bg-white dark:border-[#232D27] dark:bg-[#141B17]">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-[#E4E8E0] bg-[#F7F7F0] text-[#5E6B5B] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#8C9A88]">
              <tr>
                <th className="px-4 py-3 font-semibold">Opportunity</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Readiness</th>
                <th className="px-4 py-3 font-semibold">Missing Docs</th>
                <th className="px-4 py-3 font-semibold">Deadline</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
              {visibleItems.map((app) => {
                const r = computeReadiness(app);
                const overdue = isOverdue(app.deadline, app.status);
                return (
                  <tr key={app.id} className="hover:bg-[#F7F7F0] dark:hover:bg-[#1D2520]">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(app)}
                        className="font-bold text-[#101713] hover:underline dark:text-[#F7F7F0]"
                      >
                        {app.customTitle}
                      </button>
                      <p className="text-[#5E6B5B] dark:text-[#8C9A88]">{app.organization}</p>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {app.status}
                      {overdue && (
                        <span className="ml-1.5 whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">{app.priority}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{r.percent}%</td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {r.missingDocs > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400">{r.missingDocs} pending</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-[#C5F36A]">All ready</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {app.deadline}
                      {overdue && <span className="ml-1 text-red-700 dark:text-red-400">(passed)</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(app)}
                        className="mr-3 font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#C5F36A]"
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(app)}
                        aria-label={`Delete ${app.customTitle}`}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="inline h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Interactive Monthly Grid */}
          <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
            <div className="flex items-center justify-between border-b border-[#E4E8E0] pb-4 dark:border-[#232D27]">
              <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                {calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calYear, calMon - 1, 1))}
                  className="rounded-lg border border-[#E4E8E0] p-1.5 hover:bg-[#F7F7F0] dark:border-[#232D27] dark:hover:bg-[#1D2520]"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calYear, calMon + 1, 1))}
                  className="rounded-lg border border-[#E4E8E0] p-1.5 hover:bg-[#F7F7F0] dark:border-[#232D27] dark:hover:bg-[#1D2520]"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-[#5E6B5B]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[72px] rounded-lg bg-[#F7F7F0]/40 dark:bg-[#0C110E]/40" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const iso = `${monthPrefix}-${String(day).padStart(2, '0')}`;
                const dayApps = visibleItems.filter((a) => a.deadline.startsWith(iso));
                return (
                  <div
                    key={iso}
                    className={`min-h-[72px] rounded-lg border p-1.5 text-left ${
                      dayApps.length > 0
                        ? 'border-[#101713] bg-[#C5F36A]/20 dark:border-[#C5F36A] dark:bg-[#C5F36A]/10'
                        : 'border-[#E4E8E0] bg-[#F7F7F0] dark:border-[#232D27] dark:bg-[#0C110E]'
                    }`}
                  >
                    <span className="font-mono text-[11px] font-semibold text-[#5E6B5B] dark:text-[#8C9A88]">
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayApps.map((da) => (
                        <button
                          key={da.id}
                          type="button"
                          onClick={() => setSelected(da)}
                          className="block w-full truncate rounded bg-[#101713] px-1.5 py-0.5 text-left text-[10px] font-semibold text-[#C5F36A]"
                        >
                          {da.customTitle}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chronological Monthly Deadlines */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(byMonth)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, apps]) => (
                <div
                  key={month}
                  className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]"
                >
                  <h3 className="font-mono text-sm font-bold text-[#101713] dark:text-[#C5F36A]">
                    {month}
                  </h3>
                  <div className="mt-3 space-y-2.5">
                    {apps.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelected(a)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-2.5 text-left text-xs hover:border-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:hover:border-[#C5F36A]"
                      >
                        <span className="truncate font-semibold text-[#101713] dark:text-[#F7F7F0]">
                          {a.customTitle}
                        </span>
                        <span className="font-mono text-[#5E6B5B] shrink-0 tabular-nums dark:text-[#C5F36A]">
                          {a.deadline}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101713]/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md space-y-4 rounded-xl border border-[#E4E8E0] bg-white p-6 shadow-xl dark:border-[#232D27] dark:bg-[#141B17]"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                Track New Application
              </h2>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="h-4 w-4 text-[#5E6B5B]" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. DAAD EPOS Scholarship"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Organization</label>
              <input
                type="text"
                required
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                placeholder="e.g. DAAD Germany"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Deadline</label>
                <input
                  type="date"
                  required
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as 'high' | 'medium' | 'low')}
                  className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-[#E4E8E0] px-4 py-2 text-xs font-semibold dark:border-[#232D27]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
              >
                Save Application
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Application Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101713]/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E4E8E0] bg-white p-6 shadow-xl dark:border-[#232D27] dark:bg-[#141B17]">
            <div className="flex items-start justify-between gap-4 border-b border-[#E4E8E0] pb-4 dark:border-[#232D27]">
              <div>
                <h2 className="font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">
                  {selected.customTitle}
                </h2>
                <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                  {selected.organization} · Deadline <span className="font-mono">{selected.deadline}</span>
                  {isOverdue(selected.deadline, selected.status) && (
                    <span className="ml-1.5 font-bold text-red-700 dark:text-red-400">· Overdue</span>
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close details">
                <X className="h-5 w-5 text-[#5E6B5B]" />
              </button>
            </div>

            {(() => {
              const r = computeReadiness(selected);
              return (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-3 text-xs dark:border-[#232D27] dark:bg-[#0C110E]">
                  <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">
                    Application Readiness: <span className="font-mono">{r.percent}%</span>
                  </span>
                  <span className="font-mono text-[#5E6B5B] dark:text-[#8C9A88]">
                    {r.missingDocs} missing doc(s) · {r.pendingSteps} pending task(s)
                  </span>
                </div>
              );
            })()}

            <div className="mt-5 space-y-6">
              {/* Stage & Deadline */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#5E6B5B]">Stage</label>
                  <select
                    value={selected.status}
                    onChange={(e) =>
                      handleUpdate(selected.id, { status: e.target.value as ApplicationItem['status'] })
                    }
                    aria-describedby={
                      STAGES.some((s) => s.id !== selected.status && !canTransition(selected.status, s.id))
                        ? 'stage-transition-reason'
                        : undefined
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
                  >
                    {STAGES.map((s) => (
                      <option
                        key={s.id}
                        value={s.id}
                        disabled={!canTransition(selected.status, s.id)}
                        title={transitionBlockReason(selected.status, s.id) ?? undefined}
                      >
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const blockedStage = STAGES.find(
                      (s) => s.id !== selected.status && !canTransition(selected.status, s.id)
                    );
                    const reason = blockedStage ? transitionBlockReason(selected.status, blockedStage.id) : null;
                    return reason ? (
                      <p id="stage-transition-reason" className="mt-1 text-[10px] text-[#71806E] dark:text-[#8C9A88]">
                        {reason}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5E6B5B]">Deadline</label>
                  <input
                    type="date"
                    value={selected.deadline}
                    onChange={(e) => handleUpdate(selected.id, { deadline: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5E6B5B]">Personal Notes</label>
                <textarea
                  rows={3}
                  defaultValue={selected.notes}
                  onBlur={(e) => {
                    if (e.target.value !== selected.notes) {
                      handleUpdate(selected.id, { notes: e.target.value });
                    }
                  }}
                  placeholder="Essay themes, referee follow-ups, portal login reminders..."
                  className="mt-1 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                />
              </div>

              {/* Checklist */}
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
                  <CheckSquare className="h-4 w-4 text-[#101713] dark:text-[#C5F36A]" />
                  <span>Task Checklist</span>
                </h3>
                <div className="mt-2 space-y-2">
                  {selected.checklist.map((item) => (
                    <label key={item.id} className="flex items-center gap-2.5 text-xs">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => {
                          const next = selected.checklist.map((c) =>
                            c.id === item.id ? { ...c, done: !c.done } : c
                          );
                          handleUpdate(selected.id, { checklist: next });
                        }}
                        className="h-4 w-4 rounded border-[#E4E8E0]"
                      />
                      <span className={item.done ? 'line-through text-[#8C9A88]' : 'text-[#101713] dark:text-[#F7F7F0]'}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newChecklistLabel}
                    onChange={(e) => setNewChecklistLabel(e.target.value)}
                    placeholder="Add checklist step..."
                    className="h-8 flex-1 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newChecklistLabel.trim()) return;
                      const next = [
                        ...selected.checklist,
                        { id: `${Date.now()}`, label: newChecklistLabel.trim(), done: false },
                      ];
                      setNewChecklistLabel('');
                      handleUpdate(selected.id, { checklist: next });
                    }}
                    className="rounded-lg bg-[#101713] px-3 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Document Checklist */}
              <div>
                <h3 className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">Required Documents</h3>
                <div className="mt-2 space-y-1.5">
                  {selected.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-[#E4E8E0] px-3 py-2 text-xs dark:border-[#232D27]"
                    >
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={doc.isReady}
                          onChange={() => handleToggleDoc(doc.id, doc.isReady)}
                        />
                        <span className={doc.isReady ? 'line-through text-[#8C9A88]' : ''}>
                          {doc.docName}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-[#8C9A88] hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddDoc} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    placeholder="Add document (e.g. Official Transcript PDF)..."
                    className="h-8 flex-1 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-[#E4E8E0] px-3 text-xs font-semibold dark:border-[#232D27]"
                  >
                    Add Doc
                  </button>
                </form>
              </div>

              {/* Activity Timeline */}
              <div>
                <h3 className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">Activity Timeline</h3>
                <ul className="mt-2 space-y-1.5 text-xs text-[#5E6B5B]">
                  {selected.activity.slice(0, 8).map((act, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{act.action}</span>
                      <span className="font-mono text-[11px] shrink-0">
                        {new Date(act.timestamp).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete tracked application?"
        message={`Remove "${deleteTarget?.customTitle}" and its document checklist from your pipeline?`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
