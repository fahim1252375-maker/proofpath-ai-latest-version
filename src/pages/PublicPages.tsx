import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  Compass,
  ExternalLink,
  FileCheck2,
  Github,
  GitCompareArrows,
  Kanban,
  Linkedin,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { OpportunityItem, VerificationReport } from '../types';
import { Reveal, VerificationStatusTag } from '../components/ui/Common';
import evidenceAuditImage from '../assets/images/feature_evidence_audit_1794640632183.jpg';

interface PublicStats {
  verifiedOpportunities: number;
  totalOpportunities: number;
  verificationReports: number;
  countriesCovered: number;
  communityReports: number;
  announcement: {
    headline: string;
    subheadline: string;
    trustBanner: string;
  } | null;
}

export function DemoAccessPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl flex-col justify-center px-4 py-14 sm:px-6">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-7 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-900 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4" /> Read-only public demo
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">Student accounts are disabled</h1>
        <p className="mt-3 text-sm leading-6 text-[#455044] dark:text-[#C5CEC0]">This preview is for exploring public pages only. Registration, sign-in, uploads, application submissions, contact submissions and other data-changing actions are disabled. Do not enter real personal information.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => navigate('/opportunities')} className="rounded-lg bg-[#101713] px-4 py-2.5 text-sm font-semibold text-white dark:bg-[#C5F36A] dark:text-[#101713]">Browse catalogue</button>
          <button type="button" onClick={() => navigate('/find-a-path')} className="rounded-lg border border-[#AEB9A8] px-4 py-2.5 text-sm font-semibold text-[#101713] dark:border-[#465346] dark:text-[#F7F7F0]">Explore Pathfinder</button>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ navigate }: { navigate: (path: string) => void }) {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [sampleReport, setSampleReport] = useState<VerificationReport | null>(null);
  const [featuredOpps, setFeaturedOpps] = useState<OpportunityItem[]>([]);
  const [quickUrl, setQuickUrl] = useState('');
  const [auditImgFailed, setAuditImgFailed] = useState(false);

  useEffect(() => {
    apiRequest<PublicStats>('/api/public/stats').then(setStats).catch(() => {});
    apiRequest<{ items: VerificationReport[] }>('/api/verifications?scope=public')
      .then((res) => {
        if (res.items.length > 0) setSampleReport(res.items[0]);
      })
      .catch(() => {});
    apiRequest<{ items: OpportunityItem[] }>('/api/opportunities?limit=3&sort=verified_recent')
      .then((res) => setFeaturedOpps(res.items))
      .catch(() => {});
  }, []);

  const handleQuickVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickUrl.trim()) {
      navigate(`/verify?url=${encodeURIComponent(quickUrl.trim())}`);
    } else {
      navigate('/verify');
    }
  };

  return (
    <div className="pp-public-canvas pp-depth-page pp-depth-landing">
      <section className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 lg:px-8 lg:pb-16 lg:pt-20">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#D7DDD0] bg-white/70 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-[#455044] uppercase shadow-sm dark:border-[#344339] dark:bg-[#141B17]/70 dark:text-[#C5F36A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8CB34F]" aria-hidden="true" />
              Evidence intelligence · Student protection
            </p>
            <h1
              className="mt-6 max-w-2xl font-display text-[clamp(2.75rem,5.2vw,4.65rem)] font-extrabold leading-[0.99] tracking-[-0.055em] text-[#101713] dark:text-[#F7F7F0]"
              style={{ textWrap: 'balance' }}
            >
              Your next step deserves <span className="text-[#668A38] dark:text-[#C5F36A]">proof.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#455044] dark:text-[#A9B5A6] sm:text-lg">
              Explore published opportunities, check eligibility against stored criteria, inspect submitted URLs for reachability and basic risk cues, and organize your application plan.
            </p>

            <form
              onSubmit={handleQuickVerify}
              className="pp-card mt-8 flex flex-col gap-2 rounded-2xl border border-[#D7DDD0] bg-white p-2 shadow-[0_10px_35px_rgba(16,23,19,0.06)] sm:flex-row sm:items-center dark:border-[#344339] dark:bg-[#141B17]"
            >
              <input
                type="url"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                placeholder="Paste a scholarship or internship URL"
                aria-label="Opportunity URL to verify"
                className="h-12 min-w-0 flex-1 rounded-xl bg-transparent px-4 text-sm text-[#101713] placeholder:text-[#71806E] focus:outline-none dark:text-[#F7F7F0] dark:placeholder:text-[#8C9A88]"
              />
              <button
                type="submit"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#101713] px-5 text-sm font-semibold text-[#C5F36A] transition-all duration-200 hover:bg-[#263329] focus-visible:outline-offset-2 whitespace-nowrap shrink-0 dark:bg-[#C5F36A] dark:text-[#101713] dark:hover:bg-[#b5e458]"
              >
                <span>Check an opportunity</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#668A38] dark:text-[#C5F36A]" aria-hidden="true" /> URLs, announcements and documents</span>
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="font-semibold text-[#101713] underline decoration-[#8CB34F] decoration-2 underline-offset-4 hover:text-[#668A38] dark:text-[#C5F36A]"
              >
                Explore the opportunity directory
              </button>
            </div>
          </Reveal>

          <Reveal className="lg:col-span-6" delay={120}>
            <div className="pp-proof-visual">
              <div className="pp-proof-grid" aria-hidden="true" />
              <div className="pp-proof-orbit" aria-hidden="true" />
              <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-3 sm:inset-x-7 sm:top-7">
                <span className="font-mono text-[10px] font-semibold tracking-[0.13em] text-[#B8C5B6] uppercase">ProofPath · evidence trace</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[9px] tracking-wider text-[#D5DDD2] uppercase">
                  <span className="pp-proof-pulse h-1.5 w-1.5 rounded-full bg-[#C5F36A]" aria-hidden="true" />
                  {sampleReport ? 'Public audit sample' : 'Workflow preview'}
                </span>
              </div>

              <div className="pp-proof-node absolute left-5 right-10 top-[82px] z-10 p-4 sm:left-8 sm:right-16 sm:top-[92px] sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#C5F36A]/15 font-mono text-xs font-bold text-[#C5F36A]">01</span>
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-[#A9B5A6] uppercase">{sampleReport?.claims[0] ? 'Saved claim record' : 'Submission received'}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[#F7F7F0]">
                        {sampleReport?.claims[0]?.claim || 'URL reachability, submitted details, and review limits'}
                      </p>
                    </div>
                  </div>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#C5F36A]" aria-hidden="true" />
                </div>
              </div>

              <div className="absolute left-12 top-[169px] z-0 h-12 border-l border-dashed border-[#C5F36A]/50 sm:left-16 sm:top-[180px]" aria-hidden="true" />

              <div className="pp-proof-node absolute left-10 right-5 top-[205px] z-10 p-4 sm:left-16 sm:right-8 sm:top-[218px] sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#C5F36A]/30 bg-[#C5F36A]/10 text-[#C5F36A]">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-[#A9B5A6] uppercase">Source links on file</p>
                    <p className="mt-1 truncate text-sm font-semibold text-[#F7F7F0]">
                      {sampleReport?.evidenceSources[0]?.sourceTitle || 'Not retrieved in current review mode'}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-md border border-white/10 px-2 py-1 font-mono text-[9px] text-[#A9B5A6]">
                    {sampleReport?.evidenceSources.length ? 'LINKED' : 'NOT RUN'}
                  </span>
                </div>
              </div>

              <div className="pp-proof-verdict absolute bottom-5 left-5 right-5 z-10 flex items-center justify-between gap-4 p-4 sm:bottom-7 sm:left-8 sm:right-8 sm:p-5">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-[#C5F36A] uppercase">Review status</p>
                  <p className="mt-1 text-sm font-semibold text-[#F7F7F0]">Limits stay visible when evidence is missing.</p>
                </div>
                {sampleReport ? (
                  <VerificationStatusTag status={sampleReport.overallStatus} />
                ) : (
                  <VerificationStatusTag status="INSUFFICIENT_EVIDENCE" />
                )}
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-12" delay={80}>
        <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-2xl border border-[#D7DDD0] bg-white/80 shadow-sm backdrop-blur sm:grid-cols-4 dark:border-[#344339] dark:bg-[#141B17]/80">
          <div className="border-b border-r border-[#E4E8E0] p-4 sm:border-b-0 sm:p-5 dark:border-[#232D27]">
            <p className="font-mono text-3xl font-bold text-[#101713] tabular-nums dark:text-[#C5F36A]">
              {stats ? stats.verifiedOpportunities : '—'}
            </p>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              Verified Directory Programs
            </p>
          </div>
          <div className="border-b border-[#E4E8E0] p-4 sm:border-b-0 sm:border-r sm:p-5 dark:border-[#232D27]">
            <p className="font-mono text-3xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
              {stats ? stats.verificationReports : '—'}
            </p>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              Evidence Audits Logged
            </p>
          </div>
          <div className="border-r border-[#E4E8E0] p-4 sm:p-5 dark:border-[#232D27]">
            <p className="font-mono text-3xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
              {stats ? stats.countriesCovered : '—'}
            </p>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              Countries Covered
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="font-mono text-3xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
              6
            </p>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
              Outcome categories
            </p>
          </div>
        </div>
        </Reveal>
      </section>

      {/* Live Verification Evidence Preview (Real DB Record) */}
      <section className="border-t border-[#E4E8E0] bg-[#101713] py-16 text-[#F7F7F0] dark:border-[#232D27]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <p className="font-mono text-xs font-semibold tracking-wider text-[#C5F36A] uppercase">
                {sampleReport ? 'Public evidence report' : 'Evidence inspection'}
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
                Submitted details reviewed. Evidence limits explained.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#A9B5A6]">
                ProofPath records what was submitted, URL reachability where applicable, simple risk cues, and what the review could not establish. Current no-cost reviews do not extract claims from files or retrieve independent sources, so new reports remain INSUFFICIENT_EVIDENCE.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/verify')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C5F36A] px-4 py-2.5 text-sm font-semibold text-[#101713] hover:bg-[#b5e458]"
                >
                  <span>Open Evidence Engine</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/responsible-ai')}
                  className="rounded-lg border border-[#2C3730] px-4 py-2.5 text-sm font-medium text-[#F7F7F0] hover:bg-[#1D2520]"
                >
                  Responsible AI and review limits
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-[#2C3730] bg-[#1D2520] p-6">
                {sampleReport ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2C3730] pb-4">
                      <div>
                        <p className="font-mono text-[11px] text-[#8C9A88] uppercase">
                          Stored Public Audit · {sampleReport.inputType}
                        </p>
                        <h3 className="mt-1 font-display text-lg font-bold text-[#F7F7F0]">
                          {sampleReport.extractedInfo.title}
                        </h3>
                      </div>
                      <VerificationStatusTag status={sampleReport.overallStatus} />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[#D5DDD2]">
                      {sampleReport.summary}
                    </p>
                    <div className="mt-5 space-y-2.5">
                      {sampleReport.claims.slice(0, 2).map((c, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-[#2C3730] bg-[#141B17] p-3.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[#F7F7F0]">{c.claim}</span>
                            <span className="font-mono text-[10px] font-semibold text-[#C5F36A] shrink-0">
                              {c.verdict}
                            </span>
                          </div>
                          {c.sourceUrl && (
                            <a
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-[#C5F36A] hover:underline"
                            >
                              <span>{c.sourceUrl}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-sm text-[#8C9A88]">
                    Open the Verification Engine to inspect saved reports and their review limits.
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Opportunity Discovery Preview */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
              Opportunity directory preview
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#101713] dark:text-[#F7F7F0]">
              Explore current opportunities
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/opportunities')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            <span>View all directory programs</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {featuredOpps.length > 0 ? (
        <Reveal className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {featuredOpps.map((opp) => (
            <article
              key={opp.id}
              className="pp-card flex flex-col justify-between rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                  <span className="capitalize">
                    {opp.category} · {opp.country}
                  </span>
                  <VerificationStatusTag status={opp.verificationStatus} />
                </div>
                <h3 className="mt-3 font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">
                  {opp.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-[#5E6B5B] dark:text-[#8C9A88]">
                  {opp.organization}
                </p>
                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#455044] dark:text-[#A9B5A6]">
                  {opp.description}
                </p>
              </div>
              <div className="mt-5 border-t border-[#E4E8E0] pt-4 text-xs dark:border-[#232D27]">
                <div className="flex items-center justify-between">
                  <span className="text-[#5E6B5B] dark:text-[#8C9A88]">Deadline</span>
                  <span className="font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                    {opp.deadline}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/opportunities/${opp.id}`)}
                  className="mt-3 w-full rounded-lg border border-[#E4E8E0] py-2 text-xs font-semibold text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
                >
                  Inspect Match &amp; Trust Profile
                </button>
              </div>
            </article>
          ))}
        </Reveal>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-[#CFD7C9] bg-white/60 px-6 py-10 text-center text-sm text-[#5E6B5B] dark:border-[#2C3730] dark:bg-[#141B17]/60 dark:text-[#A9B5A6]" role="status">
            No reviewed opportunities are available in the directory yet.
          </p>
        )}
      </section>

      {/* Core Capabilities Editorial Bento */}
      <section className="border-t border-[#E4E8E0] bg-white py-16 dark:border-[#232D27] dark:bg-[#141B17]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#101713] dark:text-[#F7F7F0]">
              Built for Verification Integrity and Student Clarity
            </h2>
            <p className="mt-3 text-base text-[#5E6B5B] dark:text-[#8C9A88]">
              ProofPath AI connects opportunity records, deterministic eligibility checks, application readiness, and clear limits on local evidence review.
            </p>
          </div>

          <Reveal className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="pp-card rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-6 lg:col-span-7 dark:border-[#232D27] dark:bg-[#0C110E]">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex flex-col justify-between">
                  <div>
                    <FileCheck2 className="h-5 w-5 text-[#101713] dark:text-[#C5F36A]" />
                    <h3 className="mt-3 font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">
                      01. Submission Review and History
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#455044] dark:text-[#A9B5A6]">
                      Review submitted URLs or text, inspect basic risk cues and saved report details, and compare history. Uploaded files are validated by type and size only; their contents are not analyzed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/verify')}
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
                  >
                    <span>Launch Verification Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-[#E4E8E0] dark:border-[#232D27]">
                  {!auditImgFailed ? (
                    <img
                      src={evidenceAuditImage}
                      alt="Scholarship dossier and academic verification workflow"
                      onError={() => setAuditImgFailed(true)}
                      className="h-52 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-52 items-center justify-center bg-[#E4E8E0] dark:bg-[#1D2520]">
                      <FileCheck2 className="h-10 w-10 text-[#5E6B5B]" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-5">
              <div className="pp-card rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-6 dark:border-[#232D27] dark:bg-[#0C110E]">
                <UserCheck className="h-5 w-5 text-[#101713] dark:text-[#C5F36A]" />
                <h3 className="mt-3 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                  02. Opportunity Intelligence Score
                </h3>
                <p className="mt-1.5 text-sm text-[#455044] dark:text-[#A9B5A6]">
                  Transparent 0–100 readiness index combining profile completeness, match coverage, checklists, and safety hygiene.
                </p>
              </div>
              <div className="pp-card rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-6 dark:border-[#232D27] dark:bg-[#0C110E]">
                <Bot className="h-5 w-5 text-[#101713] dark:text-[#C5F36A]" />
                <h3 className="mt-3 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                  03. Bilingual Advisor (English &amp; বাংলা)
                </h3>
                <p className="mt-1.5 text-sm text-[#455044] dark:text-[#A9B5A6]">
                  Guided Mode summarizes your saved profile and records. Optional model replies receive only the current redacted message.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3" delay={80}>
            <div className="pp-card rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#0C110E]">
              <Compass className="h-5 w-5 text-[#101713] dark:text-[#C5F36A]" />
              <h3 className="mt-3 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                04. Opportunity Match Intelligence
              </h3>
              <p className="mt-1.5 text-sm text-[#455044] dark:text-[#A9B5A6]">
                Every opportunity displays eligibility fit, funding alignment, academic cutoff checks, and missing criteria.
              </p>
            </div>
            <div className="pp-card rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#0C110E]">
              <GitCompareArrows className="h-5 w-5 text-[#101713] dark:text-[#C5F36A]" />
              <h3 className="mt-3 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                05. Opportunity Trust Profiles
              </h3>
              <p className="mt-1.5 text-sm text-[#455044] dark:text-[#A9B5A6]">
                Inspect domain classifications, organization identity, historical audits, and community safety flags.
              </p>
            </div>
            <div className="pp-card rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#0C110E]">
              <Kanban className="h-5 w-5 text-[#101713] dark:text-[#C5F36A]" />
              <h3 className="mt-3 font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                06. Application Readiness Checklist
              </h3>
              <p className="mt-1.5 text-sm text-[#455044] dark:text-[#A9B5A6]">
                Track stage workflows across Kanban, List, and Calendar grids with missing document indicators.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How It Works & Anti-Hallucination Callout */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#101713] dark:text-[#F7F7F0]">
              Evidence Review Limits
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
              Current no-cost reviews do not retrieve independent sources. New reports stay INSUFFICIENT_EVIDENCE until a person independently checks the claims.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/how-it-works')}
            className="text-sm font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            Inspect verification tiers →
          </button>
        </div>

        <Reveal className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              step: 'STAGE 01',
              title: 'Submit a URL, Text, or File',
              body: 'URL requests are screened against SSRF rules. Uploads are checked for supported type and size; file contents are not extracted or analyzed.',
            },
            {
              step: 'STAGE 02',
              title: 'Review the Submitted Details',
              body: 'The local check can report URL reachability and a small set of risk cues. It does not search for independent sources or validate funding, fees, or deadlines.',
            },
            {
              step: 'STAGE 03',
              title: 'Read Limits and Keep Records',
              body: 'Review the INSUFFICIENT_EVIDENCE result, any detected cues, saved report details, and next steps for checking the provider directly.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="pp-card rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
            >
              <p className="font-mono text-xs font-semibold text-[#5E6B5B] dark:text-[#C5F36A]">
                {item.step}
              </p>
              <h3 className="mt-2 font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#455044] dark:text-[#A9B5A6]">
                {item.body}
              </p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[#E4E8E0] bg-[#1D2520] py-14 text-[#F7F7F0] dark:border-[#232D27]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Build a clear global opportunity pipeline
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[#A9B5A6]">
              Create a free student account to calculate your Opportunity Intelligence Score, track applications, and save evidence reports.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="rounded-lg bg-[#C5F36A] px-5 py-2.5 text-sm font-semibold text-[#101713] transition-colors hover:bg-[#b5e458] whitespace-nowrap"
            >
              Create Student Account
            </button>
            <button
              type="button"
              onClick={() => navigate('/verify')}
              className="rounded-lg border border-[#344339] px-5 py-2.5 text-sm font-semibold text-[#F7F7F0] transition-colors hover:bg-[#101713] whitespace-nowrap"
            >
              Run Public Audit
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function FeaturesPage({ navigate }: { navigate: (path: string) => void }) {
  const blocks = [
    {
      title: 'Evidence Relationship Explorer',
      detail: 'Review saved report fields and any source links already attached to a report. New no-cost reviews do not extract claims or retrieve independent sources.',
    },
    {
      title: 'Opportunity Intelligence Score',
      detail: 'Weighted 0–100 readiness metric calculated transparently from profile, match, checklist, and safety data.',
    },
    {
      title: 'Deterministic Eligibility Matching',
      detail: 'Evaluates GPA normalization, nationality rules, English test thresholds, age brackets, and deadlines without guessing.',
    },
    {
      title: 'Opportunity Trust Profiles',
      detail: 'Domain classification, organization identity, historical audit counts, and community safety indicators per program.',
    },
    {
      title: 'Application Readiness & Calendar',
      detail: 'Kanban, table list, and monthly deadline calendar views with missing-document readiness checklists.',
    },
    {
      title: 'Bilingual AI Opportunity Advisor (EN / বাংলা)',
      detail: 'Guided Mode summarizes your profile and saved records; optional model replies receive only the current redacted message.',
    },
  ];

  return (
    <div className="pp-depth-page pp-depth-public-copy mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="font-mono text-xs font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
          System Architecture
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-[#101713] sm:text-4xl dark:text-[#F7F7F0]">
          Platform Capabilities
        </h1>
        <p className="mt-3 text-base text-[#5E6B5B] dark:text-[#8C9A88]">
          Existing account workflows use stored records and server validation. Eligibility uses deterministic rules; optional AI replies do not verify opportunities or external sources.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {blocks.map((b, idx) => (
          <div
            key={b.title}
            className="rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
          >
            <p className="font-mono text-xs font-semibold text-[#5E6B5B] dark:text-[#C5F36A]">
              0{idx + 1}.
            </p>
            <h2 className="mt-2 font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">{b.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#455044] dark:text-[#A9B5A6]">{b.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <button
          type="button"
          onClick={() => navigate('/verify')}
          className="rounded-lg bg-[#101713] px-5 py-2.5 text-sm font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
        >
          Launch Verification Engine
        </button>
      </div>
    </div>
  );
}

export function HowItWorksPage({ navigate }: { navigate: (path: string) => void }) {
  const tiers = [
    { name: 'VERIFIED', desc: 'Use this status only when an authoritative organization, government, or university source directly confirms the opportunity and its terms.' },
    { name: 'SUPPORTED', desc: 'Stored credible independent or official evidence supports key claims, while some details still need review.' },
    { name: 'CONTRADICTED', desc: 'Stored primary evidence conflicts with one or more claims. Resolve the conflict before relying on the listing.' },
    { name: 'UNVERIFIED', desc: 'No authoritative confirmation is recorded. This status alone does not prove fraud.' },
    { name: 'INSUFFICIENT_EVIDENCE', desc: 'The saved record does not contain enough concrete evidence to confirm or refute its claims.' },
    { name: 'EXPIRED', desc: 'The recorded deadline has passed. Check the official page for a formal extension or a new application cycle.' },
  ];

  return (
    <div className="pp-depth-page pp-depth-public-copy mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold text-[#101713] sm:text-4xl dark:text-[#F7F7F0]">
        Verification Methodology
      </h1>
      <p className="mt-3 max-w-2xl text-base text-[#5E6B5B] dark:text-[#8C9A88]">
        Current no-cost reviews report URL reachability and basic risk cues but do not extract document contents or retrieve independent evidence. New reports therefore remain INSUFFICIENT_EVIDENCE. The labels below describe status values stored in reports and directory records; review any linked source and its date directly.
      </p>

      <div className="mt-10 space-y-4">
        {tiers.map((t) => (
          <div
            key={t.name}
            className="flex flex-col justify-between gap-3 rounded-xl border border-[#E4E8E0] bg-white p-5 sm:flex-row sm:items-center dark:border-[#232D27] dark:bg-[#141B17]"
          >
            <span className="font-mono text-xs font-bold text-[#101713] dark:text-[#C5F36A]">
              {t.name}
            </span>
            <p className="flex-1 text-sm text-[#455044] dark:text-[#A9B5A6]">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate('/verify')}
          className="rounded-lg bg-[#101713] px-5 py-2.5 text-sm font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
        >
          Audit an Opportunity
        </button>
        <button
          type="button"
          onClick={() => navigate('/responsible-ai')}
          className="rounded-lg border border-[#E4E8E0] px-5 py-2.5 text-sm font-semibold text-[#101713] hover:bg-white dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#141B17]"
        >
          Responsible AI standards
        </button>
      </div>
    </div>
  );
}

export function PricingPage({ navigate }: { navigate: (path: string) => void }) {
  const plans = [
    {
      audience: 'For individual students',
      name: 'Student Core',
      price: '$0',
      cadence: 'Free access · No subscription',
      features: [
        'URL/text review and file type/size checks (no document extraction)',
        'Saved report history, any stored source links & PDF export',
        'Opportunity directory, Trust Profiles & Match Intelligence',
        'Opportunity Intelligence Score & Eligibility Matrix',
        'Application Kanban, List & Calendar tracker',
      ],
      cta: 'Create Student Account',
      action: () => navigate('/register'),
      highlight: false,
    },
    {
      audience: 'For university advising teams',
      name: 'Institutional pilot',
      price: 'By request',
      cadence: 'No self-serve billing',
      features: [
        'Role-protected moderation and operations console',
        'Opportunity publishing and content workflows',
        'Trust & Safety and AI usage views for authorized staff',
        'Discuss a pilot; organization-specific workspaces are not enabled yet',
      ],
      cta: 'Discuss an institutional pilot',
      action: () => navigate('/contact'),
      highlight: true,
    },
  ];

  return (
    <div className="pp-depth-page pp-depth-pricing mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-[#101713] sm:text-4xl dark:text-[#F7F7F0]">
          Student access is free. Institutional pilots are scoped together.
        </h1>
        <p className="mt-3 text-base text-[#5E6B5B] dark:text-[#8C9A88]">
          Student verification and opportunity planning are available without a subscription. Contact us to discuss current institution workflows; self-service seat billing is not enabled.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`flex flex-col justify-between rounded-2xl border p-8 ${
              p.highlight
                ? 'border-[#101713] bg-[#101713] text-[#F7F7F0] dark:border-[#C5F36A] dark:bg-[#141B17]'
                : 'border-[#E4E8E0] bg-white text-[#101713] dark:border-[#232D27] dark:bg-[#141B17] dark:text-[#F7F7F0]'
            }`}
          >
            <div>
              <p className={`font-mono text-xs font-semibold uppercase ${p.highlight ? 'text-[#C5F36A]' : 'text-[#5E6B5B] dark:text-[#8C9A88]'}`}>
                {p.audience}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold">{p.name}</h2>
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className={`font-mono font-bold ${p.price === 'By request' ? 'text-2xl' : 'text-4xl tabular-nums'}`}>{p.price}</span>
                <span className={`text-sm ${p.highlight ? 'text-[#A9B5A6]' : 'text-[#5E6B5B] dark:text-[#8C9A88]'}`}>
                  {p.cadence}
                </span>
              </div>
              <ul className="mt-6 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.highlight ? 'text-[#C5F36A]' : 'text-[#101713] dark:text-[#C5F36A]'}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={p.action}
              className={`mt-8 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                p.highlight
                  ? 'bg-[#C5F36A] text-[#101713] hover:bg-[#b5e458]'
                  : 'border border-[#E4E8E0] text-[#101713] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]'
              }`}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AboutPage() {
  const principles = [
    {
      number: '01',
      title: 'Review basis and limits stay visible',
      body: 'Saved reports preserve any source links they contain and explain review limits. New no-cost reviews do not retrieve independent sources.',
    },
    {
      number: '02',
      title: 'Unknown stays unknown',
      body: 'Missing profile details and weak evidence remain visible as gaps. They are never quietly counted as a pass.',
    },
    {
      number: '03',
      title: 'A check is guidance, not a decision',
      body: 'Eligibility rules help students plan. Admissions offices and program hosts make the final funding and selection decisions.',
    },
  ];

  return (
    <div className="pp-depth-page pp-depth-public-copy mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="font-mono text-xs font-semibold tracking-[0.14em] text-[#668A38] uppercase dark:text-[#C5F36A]">A clearer path through opportunity</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#101713] sm:text-5xl dark:text-[#F7F7F0]">
        About ProofPath AI
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-relaxed text-[#455044] dark:text-[#A9B5A6]">
        International students navigate scholarship announcements, internship offers, and study-abroad portals alongside impersonation scams and misleading fee-charging intermediaries. ProofPath AI helps students and advisors explore opportunity records, check stored criteria, and review submitted links with clear limits on what each check establishes.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {principles.map((principle) => (
          <article key={principle.number} className="pp-card rounded-2xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
            <p className="font-mono text-xs font-semibold tracking-wider text-[#668A38] dark:text-[#C5F36A]">{principle.number}</p>
            <h2 className="mt-4 font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">{principle.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#5E6B5B] dark:text-[#A9B5A6]">{principle.body}</p>
          </article>
        ))}
      </div>
      <section className="pp-founder-card mt-10 rounded-2xl border border-[#D7DDD0] bg-white p-6 shadow-lg dark:border-[#344339] dark:bg-[#141B17] sm:p-8" aria-labelledby="founder-heading">
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#C5F36A]/50 bg-[#101713] font-display text-2xl font-bold text-[#C5F36A] shadow-[inset_0_0_22px_rgba(197,243,106,0.16)]">F</div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#668A38] dark:text-[#C5F36A]">Founder</p>
            <h2 id="founder-heading" className="mt-1 font-display text-xl font-bold text-[#101713] dark:text-[#F7F7F0]">Md. Minhazur Rahman Fahim</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5E6B5B] dark:text-[#A9B5A6]">Building ProofPath AI to make student opportunity research and application decisions easier to inspect.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="https://www.linkedin.com/in/md-minhazur-rahman-fahim-469b03447/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#E4E8E0] px-3 py-2 text-xs font-semibold text-[#243329] transition-transform hover:-translate-y-0.5 hover:rotate-[-1deg] hover:shadow-md dark:border-[#354139] dark:text-[#D5DDD2]"><Linkedin className="h-4 w-4" /> LinkedIn <ExternalLink className="h-3 w-3" /></a>
              <a href="https://github.com/fahim1252375-maker" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#E4E8E0] px-3 py-2 text-xs font-semibold text-[#243329] transition-transform hover:-translate-y-0.5 hover:rotate-[1deg] hover:shadow-md dark:border-[#354139] dark:text-[#D5DDD2]"><Github className="h-4 w-4" /> GitHub <ExternalLink className="h-3 w-3" /></a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ContactPage() {
  const { addToast } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, subject, message }),
      });
      setSent(true);
      addToast({ type: 'success', title: 'Message submitted', description: 'Stored in our support queue.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pp-depth-page pp-depth-contact mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold text-[#101713] dark:text-[#F7F7F0]">Contact Team</h1>
      <p className="mt-2 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
        Report an institutional partnership inquiry, verification question, or security concern.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-[#C5F36A] bg-white p-6 dark:border-[#C5F36A]/40 dark:bg-[#141B17]">
          <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#C5F36A]">
            Inquiry Received
          </h2>
          <p className="mt-1 text-sm text-[#455044] dark:text-[#A9B5A6]">
            Thank you. Your message has been recorded in our database for review by the ProofPath AI team.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setName('');
              setEmail('');
              setSubject('');
              setMessage('');
            }}
            className="mt-4 rounded-lg bg-[#101713] px-4 py-2 text-xs font-semibold text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            Send Another Message
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
        >
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Subject
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Message
            </label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] p-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#101713] px-5 py-2.5 text-sm font-semibold text-[#C5F36A] hover:bg-[#1D2520] disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            {submitting ? 'Submitting...' : 'Send Message'}
          </button>
        </form>
      )}
    </div>
  );
}

export function LegalPolicyPage({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ heading: string; body: string }>;
}) {
  return (
    <div className="pp-depth-page pp-depth-legal mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="inline-flex items-center gap-2 font-mono text-xs text-[#5E6B5B] dark:text-[#C5F36A]">
        <ShieldAlert className="h-4 w-4" />
        <span>Governance Standard</span>
      </div>
      <h1 className="mt-2 font-display text-3xl font-bold text-[#101713] dark:text-[#F7F7F0]">{title}</h1>
      <p className="mt-2 font-mono text-xs text-[#5E6B5B]">
        Effective Date: November 2026
      </p>
      <div className="mt-8 space-y-6">
        {sections.map((s) => (
          <section
            key={s.heading}
            className="rounded-xl border border-[#E4E8E0] bg-white p-6 dark:border-[#232D27] dark:bg-[#141B17]"
          >
            <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">{s.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#455044] dark:text-[#A9B5A6]">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
