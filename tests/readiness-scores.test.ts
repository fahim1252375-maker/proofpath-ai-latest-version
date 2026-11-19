import { describe, expect, it } from 'vitest';
import {
  READINESS_NOTICE,
  academicReadiness,
  applicationProgress,
  buildReadinessScorecard,
  deadlineReadiness,
  documentReadiness,
  eligibilityReadiness,
  normalizeGpaTo4,
  profileCompleteness,
  type ApplicationLike,
  type StudentProfileLike,
} from '../src/lib/readinessScores.ts';

const NOW = new Date('2026-11-17T12:00:00.000Z');

function fullProfile(overrides: Partial<StudentProfileLike> = {}): StudentProfileLike {
  return {
    nationality: 'Bangladesh',
    countryOfResidence: 'Bangladesh',
    age: 22,
    educationLevel: 'masters',
    gpa: 3.78,
    gpaScale: 4.0,
    englishProficiency: 'IELTS',
    englishScore: '7.5',
    financialNeed: 'full_funding',
    academicInterests: ['Computer Science'],
    targetCountries: ['United Kingdom'],
    ...overrides,
  };
}

function app(overrides: Partial<ApplicationLike> = {}): ApplicationLike {
  return {
    id: 'app-1',
    status: 'preparing',
    deadline: '2027-01-15',
    checklist: [{ done: true }, { done: false }, { done: true }],
    documents: [{ docName: 'Transcript', isReady: true }],
    ...overrides,
  };
}

describe('GPA normalization is pinned to the server rule', () => {
  it('copies server/eligibility.ts exactly for fixed samples', () => {
    // server: if (scale <= 0) return gpa; if (scale === 4) return gpa; else (gpa/scale)*4.0 to 2dp
    expect(normalizeGpaTo4(3.2, 4)).toBe(3.2);
    expect(normalizeGpaTo4(85, 100)).toBe(3.4);
    expect(normalizeGpaTo4(7.5, 10)).toBe(3);
    expect(normalizeGpaTo4(3.78, 4)).toBe(3.78);
    expect(normalizeGpaTo4(0.5, 0)).toBe(0.5); // degenerate scale passes through, as on the server
  });
});

describe('profile completeness', () => {
  it('scores the share of 7 filled fields with complete confidence when all are set', () => {
    const score = profileCompleteness(fullProfile());
    expect(score.score).toBe(100);
    expect(score.confidence).toBe('complete');
    expect(score.missing).toEqual([]);
    expect(score.inputs).toHaveLength(7);
  });

  it('lists missing fields by name, keeps the score over available inputs, and lowers confidence', () => {
    const score = profileCompleteness(fullProfile({ nationality: '', age: null, academicInterests: [] }));
    expect(score.score).toBe(Math.round((4 / 7) * 100));
    expect(score.confidence).toBe('partial');
    expect(score.missing).toEqual(['Nationality', 'Age', 'Academic interests']);
  });

  it('is null with unavailable confidence when there is no profile', () => {
    const score = profileCompleteness(null);
    expect(score.score).toBeNull();
    expect(score.confidence).toBe('unavailable');
  });
});

describe('academic readiness', () => {
  it('averages GPA strength, education, and English inputs when everything is present', () => {
    const score = academicReadiness(fullProfile({ gpa: 3.2, gpaScale: 4, englishProficiency: 'IELTS', englishScore: '7.5' }));
    // GPA strength = 3.2/4 = 80; education = 100; english (type + score) = 100 → average of 3 inputs
    expect(score.score).toBe(Math.round((80 + 100 + 100) / 3));
    expect(score.confidence).toBe('complete');
    expect(score.inputs.some((i) => i.label === 'GPA strength')).toBe(true);
  });

  it('does not treat a missing GPA as zero: score comes from available inputs, GPA is listed missing', () => {
    const score = academicReadiness(fullProfile({ gpa: null }));
    expect(score.score).toBe(100); // education + english only
    expect(score.confidence).toBe('partial');
    expect(score.missing).toContain('GPA (not entered — cannot estimate academic strength)');
  });

  it('flags a named test without a score as missing, not zero', () => {
    const score = academicReadiness(fullProfile({ englishScore: '' }));
    expect(score.confidence).toBe('partial');
    expect(score.missing).toContain('English score (test named but no score entered)');
  });

  it('is null with unavailable confidence when the profile has none of the academic inputs', () => {
    const score = academicReadiness(
      fullProfile({ gpa: null, educationLevel: '', englishProficiency: '', englishScore: '' })
    );
    expect(score.score).toBeNull();
    expect(score.confidence).toBe('unavailable');
  });
});

describe('eligibility readiness', () => {
  it('gives eligible records full credit and potentially-eligible half credit', () => {
    const distribution = { ELIGIBLE: 4, POTENTIALLY_ELIGIBLE: 4, NOT_ELIGIBLE: 2, MISSING_INFO: 0 };
    const score = eligibilityReadiness(distribution, true);
    expect(score.score).toBe(Math.round(((4 + 4 * 0.5) / 10) * 100)); // 60
    expect(score.confidence).toBe('complete');
  });

  it('lists the missing profile but still reports the score from real distribution data', () => {
    const distribution = { ELIGIBLE: 2, POTENTIALLY_ELIGIBLE: 0, NOT_ELIGIBLE: 2, MISSING_INFO: 6 };
    const score = eligibilityReadiness(distribution, false);
    expect(score.score).toBe(20);
    expect(score.confidence).toBe('partial');
    expect(score.missing).toContain('eligibility profile (without it the engine cannot rate records for you)');
  });

  it('is null when there are no published records to evaluate', () => {
    const score = eligibilityReadiness({ ELIGIBLE: 0, POTENTIALLY_ELIGIBLE: 0, NOT_ELIGIBLE: 0, MISSING_INFO: 0 }, true);
    expect(score.score).toBeNull();
    expect(score.confidence).toBe('unavailable');
  });
});

describe('document readiness', () => {
  it('scores the share of documents marked ready', () => {
    const score = documentReadiness([
      app({ documents: [{ isReady: true }, { isReady: false }, { isReady: true }] }),
    ]);
    expect(score.score).toBe(67);
    expect(score.confidence).toBe('complete');
  });

  it('is null — never 0 — when no documents are tracked', () => {
    const score = documentReadiness([app({ documents: [] })]);
    expect(score.score).toBeNull();
    expect(score.confidence).toBe('unavailable');
    expect(score.missing).toContain('tracked documents (add documents to your applications)');
  });
});

describe('application progress', () => {
  it('averages checklist completion over active applications only', () => {
    const score = applicationProgress([
      app({ id: 'a1', checklist: [{ done: true }, { done: true }, { done: false }, { done: false }] }),
      app({ id: 'a2', status: 'accepted', checklist: [{ done: false }, { done: false }] }), // excluded
    ]);
    expect(score.score).toBe(50);
    expect(score.confidence).toBe('complete');
  });

  it('lists applications without checklist items as missing instead of counting them as zero', () => {
    const score = applicationProgress([
      app({ id: 'a1', checklist: [{ done: true }] }),
      app({ id: 'a2', checklist: [] }),
    ]);
    expect(score.score).toBe(100);
    expect(score.confidence).toBe('partial');
    expect(score.missing).toContain('checklist items for application a2');
  });

  it('is null when there are no applications at all', () => {
    const score = applicationProgress([]);
    expect(score.score).toBeNull();
    expect(score.confidence).toBe('unavailable');
  });

  it('is null when every tracked application is closed', () => {
    const score = applicationProgress([app({ status: 'rejected' }), app({ id: 'a2', status: 'accepted' })]);
    expect(score.score).toBeNull();
    expect(score.confidence).toBe('unavailable');
  });
});

describe('deadline readiness', () => {
  it('counts applications with 14+ days left as ready; overdue counts against it', () => {
    const score = deadlineReadiness(
      [
        app({ id: 'far', deadline: '2027-01-15' }), // ~59 days out → ready
        app({ id: 'soon', deadline: '2026-11-25' }), // 8 days → against
        app({ id: 'overdue', deadline: '2026-11-01', status: 'preparing' }), // overdue → against
      ],
      NOW
    );
    expect(score.score).toBe(33);
    expect(score.confidence).toBe('complete');
  });

  it('treats exactly 14 days as ready (boundary)', () => {
    const score = deadlineReadiness([app({ deadline: '2026-12-01' })], NOW);
    expect(score.score).toBe(100);
  });

  it('treats 13 days as not ready (boundary other side)', () => {
    const score = deadlineReadiness([app({ deadline: '2026-11-30' })], NOW);
    expect(score.score).toBe(0);
  });

  it('lists an unparseable deadline as missing instead of guessing', () => {
    const score = deadlineReadiness([app({ id: 'a1', deadline: '' }), app({ id: 'a2', deadline: '2027-01-15' })], NOW);
    expect(score.score).toBe(100);
    expect(score.confidence).toBe('partial');
    expect(score.missing).toContain('valid deadline for application a1');
  });

  it('is null when there are no active applications', () => {
    expect(deadlineReadiness([], NOW).score).toBeNull();
    expect(deadlineReadiness([app({ status: 'submitted' })], NOW).score).not.toBeNull();
    expect(deadlineReadiness([app({ status: 'accepted' })], NOW).score).toBeNull();
  });
});

describe('aggregate and standing notice', () => {
  it('returns all six scores in order', () => {
    const scores = buildReadinessScorecard({
      profile: fullProfile(),
      eligibilityDistribution: { ELIGIBLE: 1, POTENTIALLY_ELIGIBLE: 1, NOT_ELIGIBLE: 1, MISSING_INFO: 1 },
      applications: [app()],
      now: NOW,
    });
    expect(scores.map((s) => s.key)).toEqual([
      'profile_completeness',
      'academic_readiness',
      'eligibility_readiness',
      'document_readiness',
      'application_progress',
      'deadline_readiness',
    ]);
    expect(scores.every((s) => s.score === null || (s.score >= 0 && s.score <= 100))).toBe(true);
  });

  it('carries the not-a-probability notice', () => {
    expect(READINESS_NOTICE).toBe(
      'Readiness is a self-assessment aid, not an admission or funding probability.'
    );
    const scores = buildReadinessScorecard({ profile: null, eligibilityDistribution: null, applications: null });
    expect(scores.every((s) => s.confidence === 'unavailable' && s.score === null)).toBe(true);
  });
});
