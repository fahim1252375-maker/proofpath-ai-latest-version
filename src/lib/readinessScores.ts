/**
 * Personal Readiness Scorecard — pure formulas, no DOM, no fetches.
 *
 * Rules encoded here (owner decisions D2/D3):
 *  - A score is computed ONLY from inputs that actually exist.
 *  - Every missing input is listed by name and lowers `confidence`; it is
 *    never treated as zero and never raises the score.
 *  - A score with no inputs at all is null with confidence 'unavailable'.
 *  - Nothing here may read as an admission or funding probability.
 */

export type Confidence = 'complete' | 'partial' | 'unavailable';

export interface ScoreInput {
  label: string;
  value: string;
  /** The real source field, e.g. "GET /api/profile → gpa". */
  source: string;
}

export interface ReadinessScore {
  key:
    | 'profile_completeness'
    | 'academic_readiness'
    | 'eligibility_readiness'
    | 'document_readiness'
    | 'application_progress'
    | 'deadline_readiness';
  label: string;
  /** 0–100, or null when no inputs exist at all. */
  score: number | null;
  /** The formula in words. */
  formula: string;
  inputs: ScoreInput[];
  missing: string[];
  confidence: Confidence;
}

export const READINESS_NOTICE =
  'Readiness is a self-assessment aid, not an admission or funding probability.';

export interface StudentProfileLike {
  nationality: string;
  countryOfResidence: string;
  age: number | null;
  educationLevel: string;
  gpa: number | null;
  gpaScale: number;
  englishProficiency: string;
  englishScore: string;
  financialNeed: string;
  academicInterests: string[];
  targetCountries: string[];
}

export interface ApplicationLike {
  id: string;
  status: string;
  deadline: string;
  checklist: Array<{ done?: boolean }>;
  documents: Array<{ docName?: string; isReady?: boolean }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Exact copy of the server's normalization rule (server/eligibility.ts). */
export function normalizeGpaTo4(gpa: number, scale: number): number {
  if (scale <= 0) return gpa;
  if (scale === 4) return gpa;
  return Number(((gpa / scale) * 4.0).toFixed(2));
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function confidenceFor(inputCount: number, missingCount: number): Confidence {
  if (inputCount === 0) return 'unavailable';
  return missingCount === 0 ? 'complete' : 'partial';
}

// ---------------------------------------------------------------------------
// 1. Profile completeness — share of the 7 core profile fields that are filled
// ---------------------------------------------------------------------------

const PROFILE_FIELDS: Array<{ key: keyof StudentProfileLike; label: string }> = [
  { key: 'nationality', label: 'Nationality' },
  { key: 'countryOfResidence', label: 'Country of residence' },
  { key: 'age', label: 'Age' },
  { key: 'educationLevel', label: 'Education level' },
  { key: 'gpa', label: 'GPA' },
  { key: 'englishProficiency', label: 'English test' },
  { key: 'academicInterests', label: 'Academic interests' },
];

export function profileCompleteness(profile: StudentProfileLike | null): ReadinessScore {
  const inputs: ScoreInput[] = [];
  const missing: string[] = [];
  if (!profile) {
    return {
      key: 'profile_completeness',
      label: 'Profile completeness',
      score: null,
      formula: 'Share of the 7 core profile fields that are filled in.',
      inputs,
      missing: ['eligibility profile (sign in and complete it)'],
      confidence: 'unavailable',
    };
  }
  let filled = 0;
  for (const field of PROFILE_FIELDS) {
    const raw = profile[field.key];
    const present = Array.isArray(raw) ? raw.length > 0 : raw !== null && raw !== undefined && String(raw).trim() !== '';
    const source = `GET /api/profile → ${field.key}`;
    if (present) {
      filled++;
      inputs.push({
        label: field.label,
        value: Array.isArray(raw) ? `${raw.length} recorded` : String(raw),
        source,
      });
    } else {
      missing.push(field.label);
    }
  }
  return {
    key: 'profile_completeness',
    label: 'Profile completeness',
    score: pct(filled, PROFILE_FIELDS.length),
    formula: `Share of the 7 core profile fields that are filled in (${filled} of 7 here).`,
    inputs,
    missing,
    confidence: confidenceFor(inputs.length, missing.length),
  };
}

// ---------------------------------------------------------------------------
// 2. Academic readiness — average of GPA strength, education level set, and
//    English test provided + scored
// ---------------------------------------------------------------------------

export function academicReadiness(profile: StudentProfileLike | null): ReadinessScore {
  const inputs: ScoreInput[] = [];
  const missing: string[] = [];
  if (!profile) {
    return {
      key: 'academic_readiness',
      label: 'Academic readiness',
      score: null,
      formula: 'Average of GPA strength (normalized to a 4.0 scale), education level set, and English test provided with a score.',
      inputs,
      missing: ['eligibility profile (sign in and complete it)'],
      confidence: 'unavailable',
    };
  }

  if (profile.gpa !== null && profile.gpa !== undefined) {
    const normalized = normalizeGpaTo4(profile.gpa, profile.gpaScale || 4.0);
    inputs.push({
      label: 'GPA strength',
      value: `${normalized.toFixed(2)} / 4.00 (normalized from ${profile.gpa} on a ${profile.gpaScale || 4.0} scale)`,
      source: 'GET /api/profile → gpa, gpaScale',
    });
  } else {
    missing.push('GPA (not entered — cannot estimate academic strength)');
  }

  if (String(profile.educationLevel || '').trim() !== '') {
    inputs.push({
      label: 'Education level',
      value: String(profile.educationLevel),
      source: 'GET /api/profile → educationLevel',
    });
  } else {
    missing.push('Education level (not entered)');
  }

  if (String(profile.englishProficiency || '').trim() !== '') {
    inputs.push({
      label: 'English test',
      value: String(profile.englishProficiency),
      source: 'GET /api/profile → englishProficiency',
    });
    if (String(profile.englishScore || '').trim() !== '') {
      inputs.push({
        label: 'English score',
        value: String(profile.englishScore),
        source: 'GET /api/profile → englishScore',
      });
    } else {
      missing.push('English score (test named but no score entered)');
    }
  } else {
    missing.push('English test (none on file)');
  }

  if (inputs.length === 0) {
    return {
      key: 'academic_readiness',
      label: 'Academic readiness',
      score: null,
      formula: 'Average of GPA strength (normalized to a 4.0 scale), education level set, and English test provided with a score.',
      inputs,
      missing,
      confidence: 'unavailable',
    };
  }

  // Three components: GPA strength (0–100), education level (binary), and
  // English test provided AND scored (binary). A missing sub-input removes
  // its component from the average instead of counting as zero.
  const components: number[] = [];
  if (profile.gpa !== null && profile.gpa !== undefined) {
    components.push(Math.max(0, Math.min(100, Math.round((normalizeGpaTo4(profile.gpa, profile.gpaScale || 4.0) / 4) * 100))));
  }
  if (String(profile.educationLevel || '').trim() !== '') components.push(100);
  if (
    String(profile.englishProficiency || '').trim() !== '' &&
    String(profile.englishScore || '').trim() !== ''
  ) {
    components.push(100);
  }
  const score = Math.round(components.reduce((a, b) => a + b, 0) / components.length);

  return {
    key: 'academic_readiness',
    label: 'Academic readiness',
    score,
    formula: 'Average of GPA strength (normalized to a 4.0 scale), education level set, and English test provided with a score.',
    inputs,
    missing,
    confidence: confidenceFor(inputs.length, missing.length),
  };
}

// ---------------------------------------------------------------------------
// 3. Eligibility readiness — share of published records rated ELIGIBLE plus
//    half credit for POTENTIALLY_ELIGIBLE
// ---------------------------------------------------------------------------

export interface EligibilityDistributionLike {
  ELIGIBLE: number;
  POTENTIALLY_ELIGIBLE: number;
  NOT_ELIGIBLE: number;
  MISSING_INFO: number;
}

export function eligibilityReadiness(
  distribution: EligibilityDistributionLike | null,
  hasProfile: boolean
): ReadinessScore {
  const formula = 'Share of published opportunity records the deterministic engine rates Eligible, plus half credit for Needs-more-information.';
  if (!distribution) {
    return {
      key: 'eligibility_readiness',
      label: 'Eligibility readiness',
      score: null,
      formula,
      inputs: [],
      missing: ['eligibility distribution (dashboard analytics could not be loaded)'],
      confidence: 'unavailable',
    };
  }
  const total =
    distribution.ELIGIBLE +
    distribution.POTENTIALLY_ELIGIBLE +
    distribution.NOT_ELIGIBLE +
    distribution.MISSING_INFO;
  if (total <= 0) {
    return {
      key: 'eligibility_readiness',
      label: 'Eligibility readiness',
      score: null,
      formula,
      inputs: [],
      missing: ['published opportunity records (the catalog is empty)'],
      confidence: 'unavailable',
    };
  }
  const inputs: ScoreInput[] = [
    { label: 'Eligible records', value: String(distribution.ELIGIBLE), source: 'GET /api/analytics/student → eligibilityDistribution.ELIGIBLE' },
    { label: 'Needs more information', value: String(distribution.POTENTIALLY_ELIGIBLE), source: 'GET /api/analytics/student → eligibilityDistribution.POTENTIALLY_ELIGIBLE' },
    { label: 'Total published records checked', value: String(total), source: 'GET /api/analytics/student → eligibilityDistribution (sum)' },
  ];
  const missing: string[] = [];
  if (!hasProfile) {
    missing.push('eligibility profile (without it the engine cannot rate records for you)');
  }
  const weighted = distribution.ELIGIBLE + distribution.POTENTIALLY_ELIGIBLE * 0.5;
  return {
    key: 'eligibility_readiness',
    label: 'Eligibility readiness',
    score: pct(weighted, total),
    formula,
    inputs,
    missing,
    confidence: confidenceFor(inputs.length, missing.length),
  };
}

// ---------------------------------------------------------------------------
// 4. Document readiness — share of tracked documents with isReady = true
// ---------------------------------------------------------------------------

export function documentReadiness(applications: ApplicationLike[] | null): ReadinessScore {
  const formula = 'Share of tracked application documents marked ready.';
  const docs = (applications ?? []).flatMap((app) => app.documents ?? []);
  if (docs.length === 0) {
    return {
      key: 'document_readiness',
      label: 'Document readiness',
      score: null,
      formula,
      inputs: [],
      missing: ['tracked documents (add documents to your applications)'],
      confidence: 'unavailable',
    };
  }
  const ready = docs.filter((d) => d.isReady === true).length;
  return {
    key: 'document_readiness',
    label: 'Document readiness',
    score: pct(ready, docs.length),
    formula: `Share of tracked application documents marked ready (${ready} of ${docs.length}).`,
    inputs: [
      { label: 'Documents tracked', value: String(docs.length), source: 'GET /api/applications → documents[]' },
      { label: 'Documents ready', value: String(ready), source: 'GET /api/applications → documents[].isReady' },
    ],
    missing: [],
    confidence: 'complete',
  };
}

// ---------------------------------------------------------------------------
// 5. Application progress — completed checklist steps averaged over active
//    applications (null when there are none)
// ---------------------------------------------------------------------------

export function applicationProgress(applications: ApplicationLike[] | null): ReadinessScore {
  const formula = 'Completed checklist steps averaged over your active applications (accepted and rejected are excluded).';
  if (!applications || applications.length === 0) {
    return {
      key: 'application_progress',
      label: 'Application progress',
      score: null,
      formula,
      inputs: [],
      missing: ['tracked applications (track your first application)'],
      confidence: 'unavailable',
    };
  }
  const active = applications.filter((a) => a.status !== 'accepted' && a.status !== 'rejected');
  if (active.length === 0) {
    return {
      key: 'application_progress',
      label: 'Application progress',
      score: null,
      formula,
      inputs: [],
      missing: ['active applications (every tracked application is closed)'],
      confidence: 'unavailable',
    };
  }
  const inputs: ScoreInput[] = [];
  const missing: string[] = [];
  let totalSteps = 0;
  let doneSteps = 0;
  for (const app of active) {
    const list = app.checklist ?? [];
    if (list.length === 0) {
      missing.push(`checklist items for application ${app.id || '(untitled)'}`);
      continue;
    }
    const done = list.filter((step) => step.done === true).length;
    totalSteps += list.length;
    doneSteps += done;
    inputs.push({
      label: `Checklist (${app.id ? `id ${app.id}` : 'application'})`,
      value: `${done} of ${list.length} steps done · status ${app.status}`,
      source: 'GET /api/applications → checklist[].done, status',
    });
  }
  if (totalSteps === 0) {
    return {
      key: 'application_progress',
      label: 'Application progress',
      score: null,
      formula,
      inputs,
      missing,
      confidence: 'unavailable',
    };
  }
  return {
    key: 'application_progress',
    label: 'Application progress',
    score: pct(doneSteps, totalSteps),
    formula: `Completed checklist steps averaged over your active applications (${doneSteps} of ${totalSteps} steps).`,
    inputs,
    missing,
    confidence: confidenceFor(inputs.length, missing.length),
  };
}

// ---------------------------------------------------------------------------
// 6. Deadline readiness — share of active applications with 14+ days left;
//    overdue and imminent deadlines count against it
// ---------------------------------------------------------------------------

export function deadlineReadiness(
  applications: ApplicationLike[] | null,
  now: Date = new Date()
): ReadinessScore {
  const formula = 'Share of active applications (accepted and rejected excluded) whose deadline is 14 or more days away; overdue and imminent deadlines count against it.';
  if (!applications || applications.length === 0) {
    return {
      key: 'deadline_readiness',
      label: 'Deadline readiness',
      score: null,
      formula,
      inputs: [],
      missing: ['tracked applications (track applications with deadlines)'],
      confidence: 'unavailable',
    };
  }
  const active = applications.filter((a) => a.status !== 'accepted' && a.status !== 'rejected');
  if (active.length === 0) {
    return {
      key: 'deadline_readiness',
      label: 'Deadline readiness',
      score: null,
      formula,
      inputs: [],
      missing: ['active applications (every tracked application is closed)'],
      confidence: 'unavailable',
    };
  }
  const inputs: ScoreInput[] = [];
  const missing: string[] = [];
  const nowMs = now.getTime();
  let readyCount = 0;
  let evaluated = 0;
  for (const app of active) {
    const ms = new Date(app.deadline).getTime();
    if (Number.isNaN(ms)) {
      missing.push(`valid deadline for application ${app.id || '(untitled)'}`);
      continue;
    }
    const daysLeft = Math.ceil((ms - nowMs) / DAY_MS);
    evaluated++;
    const ready = daysLeft >= 14;
    if (ready) readyCount++;
    inputs.push({
      label: `Deadline (id ${app.id})`,
      value: `${app.deadline} · ${daysLeft < 0 ? `${Math.abs(daysLeft)} day(s) overdue` : `${daysLeft} day(s) left`} · status ${app.status}`,
      source: 'GET /api/applications → deadline, status',
    });
  }
  if (evaluated === 0) {
    return {
      key: 'deadline_readiness',
      label: 'Deadline readiness',
      score: null,
      formula,
      inputs,
      missing,
      confidence: 'unavailable',
    };
  }
  return {
    key: 'deadline_readiness',
    label: 'Deadline readiness',
    score: pct(readyCount, evaluated),
    formula,
    inputs,
    missing,
    confidence: confidenceFor(inputs.length, missing.length),
  };
}

// ---------------------------------------------------------------------------
// Aggregate used by the scorecard component
// ---------------------------------------------------------------------------

export function buildReadinessScorecard(params: {
  profile: StudentProfileLike | null;
  eligibilityDistribution: EligibilityDistributionLike | null;
  applications: ApplicationLike[] | null;
  now?: Date;
}): ReadinessScore[] {
  return [
    profileCompleteness(params.profile),
    academicReadiness(params.profile),
    eligibilityReadiness(params.eligibilityDistribution, Boolean(params.profile)),
    documentReadiness(params.applications),
    applicationProgress(params.applications),
    deadlineReadiness(params.applications, params.now),
  ];
}
