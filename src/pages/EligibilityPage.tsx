import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { OpportunityItem, StudentProfile } from '../types';
import { SkeletonBlock } from '../components/ui/Common';
import {
  ELIGIBILITY_ESTIMATE_NOTICE,
  ELIGIBILITY_STATE_COPY,
  ELIGIBILITY_STATE_ORDER,
  eligibilityStateCopy,
} from '../lib/eligibilityLabels';

export function EligibilityPage({ navigate }: { navigate: (path: string) => void }) {
  const { profile, setProfileState, addToast } = useAuth();
  const [form, setForm] = useState({
    nationality: profile?.nationality || '',
    countryOfResidence: profile?.countryOfResidence || '',
    age: profile?.age ? String(profile.age) : '',
    educationLevel: profile?.educationLevel || '',
    gpa: profile?.gpa !== null && profile?.gpa !== undefined ? String(profile.gpa) : '',
    gpaScale: String(profile?.gpaScale || 4.0),
    englishProficiency: profile?.englishProficiency || '',
    englishScore: profile?.englishScore || '',
    financialNeed: profile?.financialNeed || 'any',
    academicInterests: (profile?.academicInterests || []).join(', '),
    targetCountries: (profile?.targetCountries || []).join(', '),
  });
  const [saving, setSaving] = useState(false);
  const [matchedOpps, setMatchedOpps] = useState<OpportunityItem[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadMatches = async () => {
    setLoadingOpps(true);
    try {
      const data = await apiRequest<{ items: OpportunityItem[] }>('/api/opportunities?limit=30');
      setMatchedOpps(data.items);
    } finally {
      setLoadingOpps(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setForm({
        nationality: profile.nationality || '',
        countryOfResidence: profile.countryOfResidence || '',
        age: profile.age ? String(profile.age) : '',
        educationLevel: profile.educationLevel || '',
        gpa: profile.gpa !== null && profile.gpa !== undefined ? String(profile.gpa) : '',
        gpaScale: String(profile.gpaScale || 4.0),
        englishProficiency: profile.englishProficiency || '',
        englishScore: profile.englishScore || '',
        financialNeed: profile.financialNeed || 'any',
        academicInterests: (profile.academicInterests || []).join(', '),
        targetCountries: (profile.targetCountries || []).join(', '),
      });
    }
    loadMatches();
  }, [profile?.updatedAt]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nationality: form.nationality.trim(),
        countryOfResidence: form.countryOfResidence.trim(),
        age: form.age ? parseInt(form.age, 10) : null,
        educationLevel: form.educationLevel,
        gpa: form.gpa ? parseFloat(form.gpa) : null,
        gpaScale: parseFloat(form.gpaScale) || 4.0,
        englishProficiency: form.englishProficiency,
        englishScore: form.englishScore.trim(),
        financialNeed: form.financialNeed,
        academicInterests: form.academicInterests
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        targetCountries: form.targetCountries
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };

      const res = await apiRequest<{ profile: StudentProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setProfileState(res.profile);
      await loadMatches();
      addToast({ type: 'success', title: 'Eligibility profile saved and recalculated' });
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to save profile' });
    } finally {
      setSaving(false);
    }
  };

  const filteredOpps =
    filterStatus === 'all'
      ? matchedOpps
      : matchedOpps.filter((o) => o.eligibility?.status === filterStatus);

  return (
    <div className="pp-depth-page pp-depth-eligibility space-y-8">
      <div>
        <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
          Deterministic Eligibility Engine
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
          Eligibility Profile &amp; Evaluation Matrix
        </h1>
        <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
          ProofPath AI never assumes missing credentials—enter your exact academic and residency attributes for transparent eligibility checks.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Profile Form */}
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl border border-[#E4E8E0] bg-white p-6 lg:col-span-5 dark:border-[#232D27] dark:bg-[#141B17]"
        >
          <h2 className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
            Student Academic Profile
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                Nationality (Citizenship)
              </label>
              <input
                type="text"
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                placeholder="e.g. Bangladesh"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                Country of Residence
              </label>
              <input
                type="text"
                value={form.countryOfResidence}
                onChange={(e) => setForm({ ...form, countryOfResidence: e.target.value })}
                placeholder="e.g. Bangladesh"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Age</label>
              <input
                type="number"
                min={13}
                max={99}
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                placeholder="e.g. 22"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                Target / Current Level
              </label>
              <select
                value={form.educationLevel}
                onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              >
                <option value="">Select level...</option>
                <option value="high_school">High School</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="masters">Master’s</option>
                <option value="phd">PhD / Doctoral</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">GPA</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={form.gpa}
                onChange={(e) => setForm({ ...form, gpa: e.target.value })}
                placeholder="e.g. 3.75"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                GPA Scale
              </label>
              <select
                value={form.gpaScale}
                onChange={(e) => setForm({ ...form, gpaScale: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              >
                <option value="4">4.0 Scale</option>
                <option value="5">5.0 Scale</option>
                <option value="10">10.0 Scale</option>
                <option value="100">100% Scale</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                English Test
              </label>
              <select
                value={form.englishProficiency}
                onChange={(e) => setForm({ ...form, englishProficiency: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              >
                <option value="">Not specified</option>
                <option value="IELTS">IELTS</option>
                <option value="TOEFL">TOEFL iBT</option>
                <option value="Duolingo">Duolingo English Test</option>
                <option value="Native / Exempt">Native / Medium Exempt</option>
                <option value="None">None yet</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
                Test Score
              </label>
              <input
                type="text"
                value={form.englishScore}
                onChange={(e) => setForm({ ...form, englishScore: e.target.value })}
                placeholder="e.g. 7.5 or 102"
                className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
              Financial Preference
            </label>
            <select
              value={form.financialNeed}
              onChange={(e) =>
                setForm({
                  ...form,
                  financialNeed: e.target.value as StudentProfile['financialNeed'],
                })
              }
              className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2.5 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            >
              <option value="full_funding">Require Full Funding</option>
              <option value="partial_funding">Open to Partial Funding</option>
              <option value="self_funded">Self-Funded / Merit Only</option>
              <option value="any">Any Funding Tier</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
              Academic Interests (comma-separated)
            </label>
            <input
              type="text"
              value={form.academicInterests}
              onChange={(e) => setForm({ ...form, academicInterests: e.target.value })}
              placeholder="Computer Science, Public Policy, AI"
              className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">
              Target Countries (comma-separated)
            </label>
            <input
              type="text"
              value={form.targetCountries}
              onChange={(e) => setForm({ ...form, targetCountries: e.target.value })}
              placeholder="United Kingdom, Germany, Japan"
              className="mt-1 h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#101713] text-sm font-semibold text-[#C5F36A] hover:bg-[#1D2520] disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving & Recalculating...' : 'Save & Recalculate Matches'}</span>
          </button>
        </form>

        {/* Eligibility Matrix */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E4E8E0] bg-white p-3 dark:border-[#232D27] dark:bg-[#141B17]">
            <div className="flex flex-wrap gap-1">
              {ELIGIBILITY_STATE_ORDER.map((status) => {
                const copy = ELIGIBILITY_STATE_COPY[status];
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    aria-pressed={filterStatus === status}
                    title={copy.meaning}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterStatus === status
                        ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                        : 'text-[#5E6B5B] hover:bg-[#F7F7F0] dark:text-[#A9B5A6] dark:hover:bg-[#1D2520]'
                    }`}
                  >
                    {copy.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loadingOpps ? (
            <SkeletonBlock className="h-72 rounded-xl" />
          ) : filteredOpps.length === 0 ? (
            <div className="rounded-xl border border-[#E4E8E0] bg-white p-6 text-sm text-[#5E6B5B] dark:border-[#232D27] dark:bg-[#141B17] dark:text-[#8C9A88]">
              No opportunity records match this state. Choose another filter or complete your profile and save to recalculate.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOpps.map((opp) => {
                const stateCopy = eligibilityStateCopy(opp.eligibility?.status);
                return (
                <div
                  key={opp.id}
                  className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <button
                        type="button"
                        onClick={() => navigate(`/opportunities/${opp.id}`)}
                        className="text-left font-display text-base font-bold text-[#101713] hover:underline dark:text-[#F7F7F0]"
                      >
                        {opp.title}
                      </button>
                      <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
                        {opp.organization} · {opp.country} · Deadline{' '}
                        <span className="font-mono">{opp.deadline}</span>
                        {opp.matchIntelligence && (
                          <span className="ml-1.5 font-mono">
                            · {opp.matchIntelligence.fundingCompatibility} funding fit
                          </span>
                        )}
                      </p>
                    </div>
                    {stateCopy && (
                      <span
                        title={stateCopy.meaning}
                        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${
                          stateCopy.status === 'ELIGIBLE'
                            ? 'border-[#9ECF42] bg-[#C5F36A]/45 text-[#101713] dark:border-[#C5F36A]/40 dark:bg-[#C5F36A]/10 dark:text-[#C5F36A]'
                            : stateCopy.status === 'NOT_ELIGIBLE'
                            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
                            : stateCopy.status === 'MISSING_INFO'
                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'border-[#C6D5BC] bg-[#EBF2E4] text-[#1D2520] dark:border-[#344339] dark:bg-[#1D2520] dark:text-[#D5E6C8]'
                        }`}
                      >
                        {stateCopy.label}
                      </span>
                    )}
                  </div>

                  {stateCopy && opp.eligibility && (
                    <div className="mt-3 rounded-lg bg-[#F7F7F0] p-3 text-xs leading-relaxed dark:bg-[#0C110E]">
                      <p className="font-semibold text-[#101713] dark:text-[#F7F7F0]">{stateCopy.label} — what this means</p>
                      <p className="mt-0.5 text-[#455044] dark:text-[#A9B5A6]">{stateCopy.meaning}</p>
                      <p className="mt-1.5 text-[#455044] dark:text-[#A9B5A6]">
                        <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">Next step: </span>
                        {stateCopy.nextAction}
                      </p>
                      {opp.eligibility.recommendedNextSteps.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-[#455044] dark:text-[#A9B5A6]">
                          {opp.eligibility.recommendedNextSteps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 border-t border-[#E4E8E0] pt-2 text-[11px] text-[#71806E] dark:border-[#232D27] dark:text-[#8C9A88]">
                        {ELIGIBILITY_ESTIMATE_NOTICE}
                      </p>
                    </div>
                  )}

                  {opp.eligibility && (
                    <div className="mt-4 space-y-1.5 border-t border-[#E4E8E0] pt-3 text-xs dark:border-[#232D27]">
                      {opp.eligibility.reasons.map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-[#101713] dark:text-[#F7F7F0]">
                            {r.criterion}
                          </span>
                          <span
                            className={`text-right ${
                              r.status === 'met'
                                ? 'text-emerald-700 dark:text-[#C5F36A]'
                                : r.status === 'unmet'
                                ? 'text-red-700 dark:text-red-400'
                                : r.status === 'missing'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-[#5E6B5B] dark:text-[#8C9A88]'
                            }`}
                          >
                            {r.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
