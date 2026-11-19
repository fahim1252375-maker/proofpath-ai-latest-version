import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Bot,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Flag,
  GitCompareArrows,
  Globe,
  Image as ImageIcon,
  Loader2,
  Network,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportVerificationReportPdf } from '../lib/pdfExport';
import { useAuth } from '../context/AuthContext';
import type { VerificationReport } from '../types';
import { EmptyState, SkeletonBlock, VerificationStatusTag } from '../components/ui/Common';

const PUBLIC_DEMO_MODE =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  (import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE !== 'false');

type ReportSubView = 'report' | 'graph' | 'timeline' | 'compare';

export function VerificationWorkspace({
  navigate,
  initialUrl = '',
  initialReportId = '',
}: {
  navigate: (path: string) => void;
  initialUrl?: string;
  initialReportId?: string;
}) {
  const { user, addToast } = useAuth();
  const [mode, setMode] = useState<'url' | 'text' | 'file'>('url');
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [titleInput, setTitleInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [refUrlInput, setRefUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [activeReport, setActiveReport] = useState<VerificationReport | null>(null);
  const [history, setHistory] = useState<VerificationReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [subView, setSubView] = useState<ReportSubView>('report');
  const [selectedClaimIndex, setSelectedClaimIndex] = useState<number>(0);
  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');
  const [serverCompare, setServerCompare] = useState<{ sharedClaims: Array<{ claim: string; occurrences: number; verdictConflict: boolean; verdicts: Array<{ reportId: string; verdict: string }> }> } | null>(null);
  const [serverCompareLoading, setServerCompareLoading] = useState(false);
  const [serverCompareError, setServerCompareError] = useState('');

  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState<'scam_fee' | 'phishing' | 'expired' | 'misleading_terms' | 'other'>('scam_fee');
  const [flagDetails, setFlagDetails] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const scope = user ? 'mine' : 'public';
      const data = await apiRequest<{ items: VerificationReport[] }>(`/api/verifications?scope=${scope}`);
      setHistory(data.items);
      if (!activeReport && !initialReportId && data.items.length > 0) {
        setActiveReport(data.items[0]);
      }
      if (data.items.length >= 2) {
        setCompareLeftId((prev) => prev || data.items[0].id);
        setCompareRightId((prev) => prev || data.items[1].id);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (initialReportId) {
      apiRequest<{ report: VerificationReport }>(`/api/verifications/${initialReportId}`)
        .then((res) => {
          setActiveReport(res.report);
          setSelectedClaimIndex(0);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Report not found'));
    }
    loadHistory();
  }, [initialReportId, user?.id]);

  const handleRunVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRunning(true);

    try {
      let result: { report: VerificationReport };
      if (mode === 'url') {
        result = await apiRequest<{ report: VerificationReport }>('/api/verify/url', {
          method: 'POST',
          body: JSON.stringify({ url: urlInput.trim(), title: titleInput.trim() || undefined }),
        });
      } else if (mode === 'text') {
        result = await apiRequest<{ report: VerificationReport }>('/api/verify/text', {
          method: 'POST',
          body: JSON.stringify({
            title: titleInput.trim() || undefined,
            text: textInput.trim(),
            referenceUrl: refUrlInput.trim() || undefined,
          }),
        });
      } else {
        if (!selectedFile) {
          throw new Error('Select a PDF, PNG, JPEG, or WEBP file first.');
        }
        const formData = new FormData();
        formData.append('file', selectedFile);
        if (titleInput.trim()) formData.append('title', titleInput.trim());
        result = await apiRequest<{ report: VerificationReport }>('/api/verify/file', {
          method: 'POST',
          body: formData,
          isMultipart: true,
        });
      }

      setActiveReport(result.report);
      setSelectedClaimIndex(0);
      setSubView('report');
      setHistory((prev) => [result.report, ...prev.filter((r) => r.id !== result.report.id)]);
      addToast({
        type: 'success',
        title: `Verification complete: ${result.report.overallStatus}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
      addToast({ type: 'error', title: 'Verification failed', description: msg });
    } finally {
      setRunning(false);
    }
  };

  const handleToggleSave = async () => {
    if (!activeReport) return;
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const res = await apiRequest<{ isSaved: boolean }>(`/api/verifications/${activeReport.id}/save`, {
        method: 'PATCH',
      });
      setActiveReport({ ...activeReport, isSaved: res.isSaved });
      addToast({ type: 'success', title: res.isSaved ? 'Report saved to workspace' : 'Removed from saved' });
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Could not update report' });
    }
  };

  const handleFlagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport) return;
    setFlagSubmitting(true);
    try {
      await apiRequest('/api/community-reports', {
        method: 'POST',
        body: JSON.stringify({
          submittedUrl: activeReport.submittedUrl || activeReport.extractedInfo.officialUrl || 'Text/File Submission',
          reason: flagReason,
          details: flagDetails,
        }),
      });
      addToast({ type: 'success', title: 'Submitted to Trust & Safety moderation queue' });
      setFlagOpen(false);
      setFlagDetails('');
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to submit report' });
    } finally {
      setFlagSubmitting(false);
    }
  };

  const compareLeft = history.find((h) => h.id === compareLeftId) || history[0] || null;
  const compareRight = history.find((h) => h.id === compareRightId) || history[1] || null;

  useEffect(() => {
    if (subView !== 'compare' || !user || !compareLeft || !compareRight) {
      setServerCompare(null);
      setServerCompareError('');
      return;
    }
    if (compareLeft.id === compareRight.id) {
      setServerCompare(null);
      setServerCompareError('Choose two different reports to compare their claim histories.');
      return;
    }
    let active = true;
    setServerCompareLoading(true);
    setServerCompareError('');
    apiRequest<{ sharedClaims: Array<{ claim: string; occurrences: number; verdictConflict: boolean; verdicts: Array<{ reportId: string; verdict: string }> }> }>('/api/verifications/compare', {
      method: 'POST',
      body: JSON.stringify({ reportIds: [compareLeft.id, compareRight.id] }),
    })
      .then((result) => {
        if (active) setServerCompare(result);
      })
      .catch((err) => {
        if (active) setServerCompareError(err instanceof Error ? err.message : 'Unable to compare report evidence.');
      })
      .finally(() => {
        if (active) setServerCompareLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subView, user?.id, compareLeft?.id, compareRight?.id]);


  const activeClaim = activeReport?.claims[selectedClaimIndex] || activeReport?.claims[0] || null;
  const linkedSources = activeReport
    ? activeReport.evidenceSources.filter(
        (s) =>
          s.claimIndex === selectedClaimIndex ||
          (activeClaim?.sourceUrl && s.sourceUrl === activeClaim.sourceUrl)
      )
    : [];

  return (
    <div className="pp-depth-page pp-depth-verification space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
            URL, Text &amp; File Review
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
            Opportunity Submission Review Workspace
          </h1>
          <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
            Review URL reachability and basic text risk cues. New no-cost checks do not retrieve independent sources; uploaded file contents are not analyzed. Reports remain INSUFFICIENT_EVIDENCE until reviewed independently.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Submission Form & History */}
        <div className="space-y-6 lg:col-span-5">
          <form
            onSubmit={handleRunVerification}
            aria-busy={running}
            className="pp-card rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
          >
            {PUBLIC_DEMO_MODE && (
              <div role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Demo preview only. Verification submissions and file uploads are disabled. Do not enter personal information or upload a CV.
              </div>
            )}
            <div className="flex items-center gap-1 rounded-lg bg-[#F7F7F0] p-1 dark:bg-[#0C110E]">
              {[
                { id: 'url', label: 'URL Check', icon: <Globe className="h-3.5 w-3.5" /> },
                { id: 'text', label: 'Paste Text', icon: <FileText className="h-3.5 w-3.5" /> },
                { id: 'file', label: 'PDF / Image', icon: <ImageIcon className="h-3.5 w-3.5" /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id as 'url' | 'text' | 'file')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    mode === tab.id
                      ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                      : 'text-[#5E6B5B] hover:text-[#101713] dark:text-[#8C9A88] dark:hover:text-[#F7F7F0]'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="verification-title" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                  Opportunity Title (optional)
                </label>
                <input
                  id="verification-title"
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="e.g. Chevening Scholarship 2027"
                  className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
                />
              </div>

              {mode === 'url' && (
                <div>
                  <label htmlFor="verification-url" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                    Official or Recruiting URL
                  </label>
                  <input
                    id="verification-url"
                    type="url"
                    required
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.org/scholarship"
                    className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
                  />
                  <p className="mt-1.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                    Protected against private-network SSRF. Checks the submitted page's reachability and limited text cues; it does not search independent sources or confirm opportunity claims.
                  </p>
                </div>
              )}

              {mode === 'text' && (
                <>
                  <div>
                    <label htmlFor="verification-text" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                      Announcement / Email / Message Text
                    </label>
                    <textarea
                      id="verification-text"
                      required
                      minLength={20}
                      rows={6}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Paste the full scholarship announcement, internship offer email, or WhatsApp message..."
                      className="mt-1 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="verification-reference-url" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                      Referenced Link (optional)
                    </label>
                    <input
                      id="verification-reference-url"
                      type="url"
                      value={refUrlInput}
                      onChange={(e) => setRefUrlInput(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
                    />
                  </div>
                </>
              )}

              {mode === 'file' && (
                <div>
                  <label htmlFor="verification-file" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                      Attach a PDF or Image for Type and Size Validation
                  </label>
                  <label htmlFor="verification-file" className="pp-upload-label mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#CFD7C9] bg-[#F7F7F0] px-4 py-8 text-center transition-colors hover:border-[#101713] dark:border-[#2C3730] dark:bg-[#0C110E] dark:hover:border-[#C5F36A]">
                    <UploadCloud className="h-7 w-7 text-[#101713] dark:text-[#C5F36A]" />
                    <span className="mt-2 text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                      {selectedFile ? selectedFile.name : 'Choose PDF, PNG, JPEG, or WEBP'}
                    </span>
                    <span className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                      Maximum 10 MB · Supported type checked; contents are not extracted or saved
                    </span>
                    <input
                      id="verification-file"
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp"
                      disabled={PUBLIC_DEMO_MODE}
                      className="sr-only"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              )}

              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <p className="sr-only" role="status" aria-live="polite">
                {running ? 'Evidence audit is running. This may take a moment.' : ''}
              </p>

              <button
                type="submit"
                disabled={PUBLIC_DEMO_MODE || running}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#101713] text-sm font-semibold text-[#C5F36A] transition-colors hover:bg-[#1D2520] disabled:opacity-60 dark:bg-[#C5F36A] dark:text-[#101713] dark:hover:bg-[#b5e458]"
              >
                {running && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{running ? 'Auditing Claims & Evidence...' : 'Run Evidence Audit'}</span>
              </button>
            </div>
          </form>

          {/* Recent Reports History */}
          <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">
                {user ? 'Your Audit History' : 'Recent Public Audits'}
              </h2>
              {history.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setSubView((v) => (v === 'compare' ? 'report' : 'compare'))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
                >
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  <span>{subView === 'compare' ? 'Exit Compare' : 'Compare 2'}</span>
                </button>
              )}
            </div>
            {loadingHistory ? (
              <div className="mt-4 space-y-2">
                <SkeletonBlock className="h-12" />
                <SkeletonBlock className="h-12" />
              </div>
            ) : history.length === 0 ? (
              <p className="mt-3 text-xs text-[#5E6B5B]">No verification reports yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
                {history.slice(0, 10).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveReport(item);
                      setSelectedClaimIndex(0);
                      if (subView === 'compare') setSubView('report');
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left transition-colors hover:bg-[#F7F7F0] dark:hover:bg-[#1D2520] ${
                      activeReport?.id === item.id ? 'bg-[#F7F7F0] dark:bg-[#1D2520]' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {item.extractedInfo.title || item.submittedTitle || 'Audit Report'}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                        {item.inputType.toUpperCase()} · {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <VerificationStatusTag status={item.overallStatus} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Report Display */}
        <div className="lg:col-span-7">
          {running ? (
            <div className="space-y-4 rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]" aria-busy="true" aria-label="Audit report loading">
              <SkeletonBlock className="h-8 w-2/3" />
              <SkeletonBlock className="h-20" />
              <SkeletonBlock className="h-32" />
              <SkeletonBlock className="h-32" />
            </div>
          ) : !activeReport ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No verification report selected"
              description="Submit an opportunity URL, announcement text, or PDF/poster on the left to inspect claim-by-claim evidence."
            />
          ) : (
            <div className="space-y-6 rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]">
              {/* Top Report Header */}
              <div className="flex flex-col justify-between gap-4 border-b border-[#E4E8E0] pb-5 sm:flex-row sm:items-start dark:border-[#232D27]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <VerificationStatusTag status={activeReport.overallStatus} />
                    <span className="font-mono text-xs text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">
                      Checked {new Date(activeReport.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="mt-2.5 font-display text-xl font-bold text-[#101713] dark:text-[#F7F7F0]">
                    {activeReport.extractedInfo.title}
                  </h2>
                  <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                    {activeReport.extractedInfo.organization} · {activeReport.extractedInfo.country}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleSave}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E8E0] px-3 py-1.5 text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>{activeReport.isSaved ? 'Saved' : 'Save'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportVerificationReportPdf(activeReport)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E8E0] px-3 py-1.5 text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export PDF</span>
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/assistant?reportId=${activeReport.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#101713] px-3 py-1.5 text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
                    >
                      <Bot className="h-3.5 w-3.5" />
                      <span>Ask AI</span>
                    </button>
                  )}
                </div>
              </div>

              <details className="group rounded-xl border border-[#DDE8D4] bg-[#F5F8F0] px-4 py-3 dark:border-[#344438] dark:bg-[#141F18]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#17221A] outline-none focus-visible:ring-2 focus-visible:ring-[#91B95A] focus-visible:ring-offset-2 dark:text-[#F7F7F0]">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#557A3E] dark:text-[#C5F36A]" aria-hidden="true" />
                    How to read this verdict
                  </span>
                  <span className="text-xs font-medium text-[#65765F] group-open:hidden dark:text-[#A9B5A6]">Show guide +</span>
                  <span className="hidden text-xs font-medium text-[#65765F] group-open:inline dark:text-[#A9B5A6]">Hide guide −</span>
                </summary>
                <p className="mt-3 rounded-lg border border-[#DDE8D4] bg-[#ECF2E5] px-3 py-2 text-xs leading-relaxed text-[#40513A] dark:border-[#344438] dark:bg-[#1A291D] dark:text-[#D6E9C2]" role="note">
                  New no-cost checks do not retrieve independent sources and report INSUFFICIENT_EVIDENCE. The definitions below explain statuses stored in reports or directory records; a stored label does not mean this check performed those review steps.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[#DDE8D4] pt-3 sm:grid-cols-2 dark:border-[#344438]">
                  <div className="rounded-lg bg-white/75 p-3 dark:bg-[#0C110E]/70">
                    <p className="text-xs font-bold text-[#166534] dark:text-[#A7D98A]">Verified</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#53614F] dark:text-[#A9B5A6]">An authoritative primary or official domain directly confirms authenticity and details.</p>
                  </div>
                  <div className="rounded-lg bg-white/75 p-3 dark:bg-[#0C110E]/70">
                    <p className="text-xs font-bold text-[#315D9A] dark:text-[#9CC7FF]">Supported</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#53614F] dark:text-[#A9B5A6]">Credible independent or official evidence supports the claims, but some details remain unconfirmed.</p>
                  </div>
                  <div className="rounded-lg bg-white/75 p-3 dark:bg-[#0C110E]/70">
                    <p className="text-xs font-bold text-[#B42318] dark:text-[#FFAAA4]">Contradicted</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#53614F] dark:text-[#A9B5A6]">Stored primary evidence conflicts with one or more claims. Resolve the conflict before relying on the listing.</p>
                  </div>
                  <div className="rounded-lg bg-white/75 p-3 dark:bg-[#0C110E]/70">
                    <p className="text-xs font-bold text-[#946200] dark:text-[#F4D184]">Unverified</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#53614F] dark:text-[#A9B5A6]">No credible authoritative confirmation was found. This does not by itself prove fraud.</p>
                  </div>
                  <div className="rounded-lg bg-white/75 p-3 dark:bg-[#0C110E]/70">
                    <p className="text-xs font-bold text-[#946200] dark:text-[#F4D184]">Insufficient evidence</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#53614F] dark:text-[#A9B5A6]">There were not enough concrete, verifiable identifiers to confirm or refute the claims.</p>
                  </div>
                  <div className="rounded-lg bg-white/75 p-3 dark:bg-[#0C110E]/70">
                    <p className="text-xs font-bold text-[#65765F] dark:text-[#C5F36A]">Expired</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#53614F] dark:text-[#A9B5A6]">The recorded deadline has passed. Check the official page for a formal extension or a new application cycle.</p>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-[#DDE8D4] bg-[#ECF2E5] px-3 py-2 text-xs leading-relaxed text-[#40513A] dark:border-[#344438] dark:bg-[#1A291D] dark:text-[#D6E9C2]">
                  A stored status is not a guarantee. If the report contains a source link, open it and confirm its date, deadlines, eligibility, and any fee request before sending money or sensitive documents.
                </p>
              </details>

              {/* Sub-View Explorer Switcher */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F7F7F0] p-1 dark:bg-[#0C110E]">
                {[
                  { id: 'report', label: 'Report Details', icon: <FileText className="h-3.5 w-3.5" /> },
                  { id: 'graph', label: 'Saved Evidence Graph', icon: <Network className="h-3.5 w-3.5" /> },
                  { id: 'timeline', label: 'Audit Timeline', icon: <Clock className="h-3.5 w-3.5" /> },
                  ...(history.length >= 2
                    ? [{ id: 'compare', label: 'Compare History', icon: <GitCompareArrows className="h-3.5 w-3.5" /> }]
                    : []),
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSubView(t.id as ReportSubView)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      subView === t.id
                        ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                        : 'text-[#5E6B5B] hover:text-[#101713] dark:text-[#8C9A88] dark:hover:text-[#F7F7F0]'
                    }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {subView === 'graph' ? (
                <div className="space-y-5">
                  <div className="rounded-xl border border-[#232D27] bg-[#101713] p-5 text-[#F7F7F0]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232D27] pb-3">
                      <div>
                        <p className="font-mono text-[11px] font-semibold text-[#C5F36A] uppercase">
                          Saved Evidence Links
                        </p>
                        <p className="mt-0.5 text-xs text-[#A9B5A6]">
                          {activeReport.claims.length || activeReport.evidenceSources.length
                            ? 'This view shows claim and source links already stored with this report; it does not run a new source search.'
                            : 'This report has no claim-level analysis or independent source links. Current no-cost reviews do not extract claims or retrieve sources.'}
                        </p>
                      </div>
                      <VerificationStatusTag status={activeReport.overallStatus} />
                    </div>

                    {/* Node-Link Chain Diagram */}
                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
                      {/* Origin & Org Node */}
                      <div className="space-y-3 md:col-span-3">
                        <div className="rounded-lg border border-[#2C3730] bg-[#1D2520] p-3">
                          <p className="font-mono text-[10px] text-[#8C9A88] uppercase">Submission</p>
                          <p className="mt-1 truncate text-xs font-semibold text-[#F7F7F0]">
                            {activeReport.submittedTitle || activeReport.submittedUrl || activeReport.fileName || activeReport.inputType.toUpperCase()}
                          </p>
                        </div>
                        <div className="flex justify-center">
                          <div className="h-4 w-px bg-[#C5F36A]/50" />
                        </div>
                        <div className="rounded-lg border border-[#2C3730] bg-[#1D2520] p-3">
                          <p className="font-mono text-[10px] text-[#8C9A88] uppercase">Organization Field</p>
                          <p className="mt-1 text-xs font-semibold text-[#C5F36A]">
                            {activeReport.extractedInfo.organization}
                          </p>
                        </div>
                      </div>

                      {/* Claim Nodes */}
                      <div className="space-y-2 md:col-span-5">
                        <p className="font-mono text-[10px] text-[#8C9A88] uppercase">
                          Saved Claim Details ({activeReport.claims.length})
                        </p>
                        {activeReport.claims.length === 0 ? (
                          <p className="rounded-lg border border-[#232D27] p-3 text-xs text-[#8C9A88]">
                            No claim-by-claim analysis was run for this submission.
                          </p>
                        ) : (
                          activeReport.claims.map((c, idx) => {
                            const selected = idx === selectedClaimIndex;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedClaimIndex(idx)}
                                className={`flex w-full items-start justify-between gap-2 rounded-lg border p-3 text-left text-xs transition-colors ${
                                  selected
                                    ? 'border-[#C5F36A] bg-[#1D2520] text-[#F7F7F0]'
                                    : 'border-[#232D27] bg-[#141B17] text-[#A9B5A6] hover:border-[#5E6B5B]'
                                }`}
                              >
                                <span className="line-clamp-2 font-medium">{c.claim}</span>
                                <span className="font-mono text-[10px] font-bold text-[#C5F36A] shrink-0">
                                  {c.verdict}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Connected Sources & Verdict Node */}
                      <div className="space-y-3 md:col-span-4">
                        <div className="rounded-lg border border-[#2C3730] bg-[#1D2520] p-3">
                          <p className="font-mono text-[10px] text-[#8C9A88] uppercase">
                            Linked Sources ({linkedSources.length})
                          </p>
                          {linkedSources.length === 0 ? (
                            <p className="mt-1 text-[11px] text-[#A9B5A6]">
                              {activeClaim?.sourceUrl && activeClaim.sourceUrl.startsWith('http')
                                ? activeClaim.sourceUrl
                                : 'No source link is stored for this claim.'}
                            </p>
                          ) : (
                            <ul className="mt-1.5 space-y-1.5 text-[11px]">
                              {linkedSources.map((src, sIdx) => (
                                <li key={sIdx} className="border-t border-[#232D27] pt-1.5 first:border-0 first:pt-0">
                                  <a
                                    href={src.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-[#C5F36A] hover:underline"
                                  >
                                    <span className="truncate max-w-[180px]">{src.sourceTitle}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                  <p className="font-mono text-[10px] text-[#8C9A88]">stance: {src.stance}</p>
                                  <p className="mt-1 font-mono text-[10px] text-[#C5F36A]">
                                    URL signal: {src.credibility.level} · {src.credibility.score}/100
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-[#8C9A88]">
                                    Host: {src.credibility.host}. This is not proof of legitimacy or accreditation.
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="rounded-lg border border-[#C5F36A]/40 bg-[#C5F36A]/10 p-3">
                          <p className="font-mono text-[10px] text-[#C5F36A] uppercase">Final Verdict</p>
                          <p className="mt-1 text-sm font-bold text-[#F7F7F0]">{activeReport.overallStatus}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active Claim Deep Inspection */}
                  {activeClaim && (
                    <div className="rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-4 dark:border-[#232D27] dark:bg-[#0C110E]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
                          Selected Node Inspection — Claim #{selectedClaimIndex + 1}
                        </p>
                        <VerificationStatusTag status={activeClaim.verdict} />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {activeClaim.claim}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#5E6B5B] dark:text-[#8C9A88]">
                        {activeClaim.explanation}
                      </p>
                      {activeClaim.evidenceExcerpt && (
                        <blockquote className="mt-2 border-l-2 border-[#C5F36A] pl-3 text-xs text-[#1D2520] dark:text-[#D5DDD2]">
                          “{activeClaim.evidenceExcerpt}”
                        </blockquote>
                      )}
                    </div>
                  )}
                </div>
              ) : subView === 'timeline' ? (
                <div className="space-y-4">
                  <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                    Submission time and any source links stored with this report. New no-cost reviews do not retrieve independent sources.
                  </p>
                  <ol className="relative space-y-4 border-l border-[#CFD7C9] pl-5 dark:border-[#2C3730]">
                    <li>
                      <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-[#101713] bg-[#C5F36A]" />
                      <p className="font-mono text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                        {new Date(activeReport.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        Submission Received ({activeReport.inputType.toUpperCase()})
                      </p>
                      <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                        Target: {activeReport.submittedUrl || activeReport.fileName || activeReport.submittedTitle || 'Direct Text Audit'}
                      </p>
                    </li>

                    {activeReport.evidenceSources.map((src, i) => (
                      <li key={i}>
                        <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-[#101713] bg-white dark:bg-[#141B17]" />
                        <p className="font-mono text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                          {new Date(src.retrievedAt || activeReport.createdAt).toLocaleString()} · Stance: {src.stance}
                        </p>
                        <a
                          href={src.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#F7F7F0]"
                        >
                          <span>{src.sourceTitle}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {src.excerpt && (
                          <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">“{src.excerpt}”</p>
                        )}
                      </li>
                    ))}

                    <li>
                      <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-[#101713] dark:bg-[#C5F36A]" />
                      <p className="font-mono text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                        Audit Concluded · {activeReport.claims.length} Claims Evaluated
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">Overall Verdict:</span>
                        <VerificationStatusTag status={activeReport.overallStatus} />
                      </div>
                    </li>
                  </ol>
                </div>
              ) : subView === 'compare' && compareLeft && compareRight ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-4 dark:border-[#232D27] dark:bg-[#0C110E]">
                    <p className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">Cross-report claim analysis</p>
                    {serverCompareLoading ? (
                      <p className="mt-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Comparing claim records…</p>
                    ) : serverCompareError ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{serverCompareError}</p>
                    ) : serverCompare?.sharedClaims.length ? (
                      <div className="mt-2 space-y-2">
                        {serverCompare.sharedClaims.map((claim, index) => (
                          <div key={index} className="rounded-md border border-[#E4E8E0] bg-white p-3 dark:border-[#232D27] dark:bg-[#141B17]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold">{claim.claim}</p>
                              <span className={`rounded px-2 py-1 text-[10px] font-semibold ${claim.verdictConflict ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                                {claim.verdictConflict ? 'Verdict differs' : 'Verdicts align'}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                              {claim.verdicts.map((item) => item.verdict).join(' · ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                        No matching claim text appears in both reports. The comparison below still shows their extracted fields.
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-[#8C9A88]">Claim wording is normalized for comparison. Different page versions and retrieval dates can explain differing outcomes; review the underlying sources.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#5E6B5B]">Audit Report A</label>
                      <select
                        value={compareLeft.id}
                        onChange={(e) => setCompareLeftId(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                      >
                        {history.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.extractedInfo.title} ({new Date(h.createdAt).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#5E6B5B]">Audit Report B</label>
                      <select
                        value={compareRight.id}
                        onChange={(e) => setCompareRightId(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
                      >
                        {history.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.extractedInfo.title} ({new Date(h.createdAt).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-[#E4E8E0] dark:border-[#232D27]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#E4E8E0] bg-[#F7F7F0] dark:border-[#232D27] dark:bg-[#0C110E]">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold text-[#5E6B5B]">Field</th>
                          <th className="px-3 py-2.5 font-semibold text-[#101713] dark:text-[#F7F7F0]">Report A</th>
                          <th className="px-3 py-2.5 font-semibold text-[#101713] dark:text-[#F7F7F0]">Report B</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E8E0] dark:divide-[#232D27]">
                        <tr>
                          <td className="px-3 py-2.5 font-medium text-[#5E6B5B]">Verdict</td>
                          <td className="px-3 py-2.5"><VerificationStatusTag status={compareLeft.overallStatus} /></td>
                          <td className="px-3 py-2.5"><VerificationStatusTag status={compareRight.overallStatus} /></td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium text-[#5E6B5B]">Organization</td>
                          <td className="px-3 py-2.5">{compareLeft.extractedInfo.organization}</td>
                          <td className="px-3 py-2.5">{compareRight.extractedInfo.organization}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium text-[#5E6B5B]">Fees Mentioned</td>
                          <td className="px-3 py-2.5">{compareLeft.extractedInfo.feesMentioned}</td>
                          <td className="px-3 py-2.5">{compareRight.extractedInfo.feesMentioned}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium text-[#5E6B5B]">Deadline</td>
                          <td className="px-3 py-2.5 font-mono">{compareLeft.extractedInfo.deadline}</td>
                          <td className="px-3 py-2.5 font-mono">{compareRight.extractedInfo.deadline}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium text-[#5E6B5B]">Claims / Sources</td>
                          <td className="px-3 py-2.5 font-mono">
                            {compareLeft.claims.length} claims / {compareLeft.evidenceSources.length} sources
                          </td>
                          <td className="px-3 py-2.5 font-mono">
                            {compareRight.claims.length} claims / {compareRight.evidenceSources.length} sources
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium text-[#5E6B5B]">Risk Flags</td>
                          <td className="px-3 py-2.5 font-mono">{compareLeft.riskIndicators.length}</td>
                          <td className="px-3 py-2.5 font-mono">{compareRight.riskIndicators.length}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div>
                    <h3 className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#8C9A88]">
                      Verification Assessment
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#101713] dark:text-[#E4E8E0]">
                      {activeReport.summary}
                    </p>
                  </div>

                  {/* Extracted Details Grid */}
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-4 sm:grid-cols-3 dark:border-[#232D27] dark:bg-[#0C110E]">
                    <div>
                      <p className="text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">Funding / Value</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {activeReport.extractedInfo.fundingAmount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">Deadline</p>
                      <p className="mt-0.5 font-mono text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {activeReport.extractedInfo.deadline}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">Fees Mentioned</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                        {activeReport.extractedInfo.feesMentioned}
                      </p>
                    </div>
                  </div>

                  {/* Claim-by-Claim Analysis */}
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">
                      Saved Claim Details ({activeReport.claims.length})
                    </h3>
                    <div className="mt-3 space-y-3">
                      {activeReport.claims.map((c, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-[#E4E8E0] p-4 dark:border-[#232D27]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
                              {c.claim}
                            </p>
                            <VerificationStatusTag status={c.verdict} />
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[#5E6B5B] dark:text-[#A9B5A6]">
                            {c.explanation}
                          </p>
                          {c.evidenceExcerpt && (
                            <blockquote className="mt-2 rounded border-l-2 border-[#C5F36A] bg-[#F7F7F0] px-3 py-2 text-xs text-[#1D2520] dark:bg-[#0C110E] dark:text-[#A9B5A6]">
                              “{c.evidenceExcerpt}”
                            </blockquote>
                          )}
                          {c.sourceUrl && c.sourceUrl.startsWith('http') && (
                            <a
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#C5F36A]"
                            >
                              <span>{c.sourceUrl}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Evidence Sources */}
                  {activeReport.evidenceSources.length > 0 && (
                    <div>
                      <h3 className="font-display text-sm font-bold text-[#101713] dark:text-[#F7F7F0]">
                        Sources Linked to This Report ({activeReport.evidenceSources.length})
                      </h3>
                      <ul className="mt-2 space-y-1.5 text-xs">
                        {activeReport.evidenceSources.map((src, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-2 rounded-md border border-[#E4E8E0] bg-[#F7F7F0] px-3 py-2 dark:border-[#232D27] dark:bg-[#0C110E]"
                          >
                            <a
                              href={src.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate font-semibold text-[#101713] hover:underline dark:text-[#C5F36A]"
                            >
                              {src.sourceTitle} — {src.sourceUrl}
                            </a>
                            <span className="font-mono text-[11px] text-[#5E6B5B] shrink-0">{src.stance}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risk Indicators & Confidence Limitations */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-[#E4E8E0] p-4 dark:border-[#232D27]">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span>Risk Indicators</span>
                      </h4>
                      {activeReport.riskIndicators.length === 0 ? (
                        <p className="mt-2 text-xs text-[#5E6B5B]">No acute risk indicators flagged.</p>
                      ) : (
                        <ul className="mt-2 space-y-2 text-xs">
                          {activeReport.riskIndicators.map((r, idx) => (
                            <li key={idx}>
                              <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">
                                [{r.severity.toUpperCase()}] {r.flag}:
                              </span>{' '}
                              <span className="text-[#5E6B5B] dark:text-[#8C9A88]">{r.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-lg border border-[#E4E8E0] p-4 dark:border-[#232D27]">
                      <h4 className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
                        Confidence Limitations &amp; Next Actions
                      </h4>
                      <p className="mt-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                        {activeReport.confidenceLimitations}
                      </p>
                      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-[#1D2520] dark:text-[#D5DDD2]">
                        {activeReport.recommendedActions.map((act, i) => (
                          <li key={i}>{act}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}

              {/* Community Flag Action */}
              <div className="border-t border-[#E4E8E0] pt-4 dark:border-[#232D27]">
                {!flagOpen ? (
                  <button
                    type="button"
                    onClick={() => setFlagOpen(true)}
                    disabled={PUBLIC_DEMO_MODE}
                    className="inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50 text-xs font-semibold text-[#5E6B5B] hover:text-red-600 dark:text-[#8C9A88]"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    <span>Report fraud, advance fees, or inaccurate terms to Moderation</span>
                  </button>
                ) : (
                  <form
                    onSubmit={handleFlagSubmit}
                    className="space-y-3 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-4 dark:border-[#232D27] dark:bg-[#0C110E]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#101713] dark:text-[#F7F7F0]">
                        Submit Trust &amp; Safety Report
                      </span>
                      <button
                        type="button"
                        onClick={() => setFlagOpen(false)}
                        className="text-xs text-[#5E6B5B] hover:text-[#101713] dark:hover:text-[#F7F7F0]"
                      >
                        Close
                      </button>
                    </div>
                    <select
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value as typeof flagReason)}
                      className="h-9 w-full rounded-lg border border-[#E4E8E0] bg-white px-2.5 text-xs dark:border-[#232D27] dark:bg-[#141B17]"
                    >
                      <option value="scam_fee">Requests upfront processing/application fee</option>
                      <option value="phishing">Suspicious phishing / domain impersonation</option>
                      <option value="expired">Expired or closed program listed as active</option>
                      <option value="misleading_terms">Misleading funding or eligibility terms</option>
                      <option value="other">Other concern</option>
                    </select>
                    <textarea
                      required
                      minLength={10}
                      rows={3}
                      value={flagDetails}
                      onChange={(e) => setFlagDetails(e.target.value)}
                      placeholder="Describe the issue or suspicious payment request..."
                      className="w-full rounded-lg border border-[#E4E8E0] bg-white p-2.5 text-xs dark:border-[#232D27] dark:bg-[#141B17]"
                    />
                    <button
                      type="submit"
                      disabled={PUBLIC_DEMO_MODE || flagSubmitting}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      {flagSubmitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
