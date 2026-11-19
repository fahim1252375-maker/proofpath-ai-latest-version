import type {
  EligibilityCriterionResult,
  EligibilityEvaluation,
  OpportunityIntelligenceScore,
  OpportunityMatchIntelligence,
  OpportunityRecord,
  OpportunityTrustProfile,
  StudentProfile,
} from './types.ts';

function normalizeGpaTo4(gpa: number, scale: number): number {
  if (scale <= 0) return gpa;
  if (scale === 4) return gpa;
  return Number(((gpa / scale) * 4.0).toFixed(2));
}

function hasSufficientEnglish(proficiency: string, score: string, requirement: string): 'met' | 'unmet' | 'missing' {
  const reqLower = requirement.toLowerCase();
  if (!requirement || reqLower.includes('not required') || reqLower.includes('none')) {
    return 'met';
  }
  if (!proficiency || proficiency === 'None' || proficiency === '') {
    return 'missing';
  }
  if (proficiency === 'Native / Exempt') {
    return 'met';
  }
  const numScore = parseFloat(score);
  if (Number.isNaN(numScore)) {
    return 'missing';
  }
  if (proficiency === 'IELTS') {
    const match = reqLower.match(/ielts\s*(\d+(?:\.\d+)?)/);
    const minIelts = match ? parseFloat(match[1]) : 6.5;
    return numScore >= minIelts ? 'met' : 'unmet';
  }
  if (proficiency === 'TOEFL') {
    const match = reqLower.match(/toefl\s*(\d+)/);
    const minToefl = match ? parseInt(match[1], 10) : 85;
    return numScore >= minToefl ? 'met' : 'unmet';
  }
  if (proficiency === 'Duolingo') {
    const match = reqLower.match(/duolingo\s*(\d+)/);
    const minDet = match ? parseInt(match[1], 10) : 110;
    return numScore >= minDet ? 'met' : 'unmet';
  }
  return 'met';
}

export function evaluateEligibility(
  profile: StudentProfile | null,
  opportunity: OpportunityRecord
): EligibilityEvaluation {
  const reasons: EligibilityCriterionResult[] = [];
  const nextSteps: string[] = [];

  const deadlineDate = new Date(opportunity.deadline);
  const now = new Date();
  const isExpired = !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < now.getTime();

  if (isExpired) {
    reasons.push({
      criterion: 'Deadline',
      status: 'unmet',
      detail: `Application deadline (${opportunity.deadline}) has passed.`,
    });
  } else {
    reasons.push({
      criterion: 'Deadline',
      status: 'met',
      detail: `Accepting planning/applications until ${opportunity.deadline}.`,
    });
  }

  if (!profile) {
    return {
      status: isExpired ? 'NOT_ELIGIBLE' : 'MISSING_INFO',
      scoreLabel: 'Profile incomplete',
      reasons: [
        ...reasons,
        {
          criterion: 'Student Profile',
          status: 'missing',
          detail: 'Complete your nationality, education level, GPA, and English proficiency to evaluate eligibility.',
        },
      ],
      recommendedNextSteps: [
        'Complete your Student Eligibility Profile so ProofPath AI can check nationality, GPA, age, and language criteria.',
      ],
    };
  }

  let hasUnmet = isExpired;
  let missingCount = 0;

  // 1. Nationality
  const eligibleCountries = opportunity.eligibleNationalities.map((c) => c.toLowerCase());
  const allowsAll = eligibleCountries.includes('all') || eligibleCountries.includes('global');
  if (!profile.nationality) {
    missingCount++;
    reasons.push({
      criterion: 'Nationality',
      status: 'missing',
      detail: 'Your nationality is not set in your profile.',
    });
    nextSteps.push('Add your country of citizenship to confirm nationality eligibility.');
  } else if (allowsAll || eligibleCountries.includes(profile.nationality.toLowerCase())) {
    reasons.push({
      criterion: 'Nationality',
      status: 'met',
      detail: `${profile.nationality} is within eligible nationalities (${allowsAll ? 'Global' : opportunity.eligibleNationalities.join(', ')}).`,
    });
  } else {
    hasUnmet = true;
    reasons.push({
      criterion: 'Nationality',
      status: 'unmet',
      detail: `${profile.nationality} is not listed among eligible nationalities (${opportunity.eligibleNationalities.join(', ')}).`,
    });
  }

  // 2. Education Level
  if (opportunity.educationLevel === 'all') {
    reasons.push({
      criterion: 'Education Level',
      status: 'met',
      detail: 'Open to students across academic levels.',
    });
  } else if (!profile.educationLevel) {
    missingCount++;
    reasons.push({
      criterion: 'Education Level',
      status: 'missing',
      detail: `Requires ${opportunity.educationLevel.replace('_', ' ')} status; your level is not specified.`,
    });
    nextSteps.push('Specify your current or target education level.');
  } else if (profile.educationLevel === opportunity.educationLevel) {
    reasons.push({
      criterion: 'Education Level',
      status: 'met',
      detail: `Matches required ${opportunity.educationLevel.replace('_', ' ')} level.`,
    });
  } else {
    hasUnmet = true;
    reasons.push({
      criterion: 'Education Level',
      status: 'unmet',
      detail: `Opportunity targets ${opportunity.educationLevel.replace('_', ' ')}, while your profile is set to ${profile.educationLevel.replace('_', ' ')}.`,
    });
  }

  // 3. GPA Requirement
  if (opportunity.minGpa === null || opportunity.minGpa === 0) {
    reasons.push({
      criterion: 'Academic GPA',
      status: 'met',
      detail: 'No strict minimum GPA cutoff published.',
    });
  } else if (profile.gpa === null) {
    missingCount++;
    reasons.push({
      criterion: 'Academic GPA',
      status: 'missing',
      detail: `Minimum GPA ${opportunity.minGpa.toFixed(2)}/4.00 required; your GPA is not entered.`,
    });
    nextSteps.push('Add your current GPA and grading scale to verify academic cutoffs.');
  } else {
    const normalizedGpa = normalizeGpaTo4(profile.gpa, profile.gpaScale || 4.0);
    if (normalizedGpa >= opportunity.minGpa) {
      reasons.push({
        criterion: 'Academic GPA',
        status: 'met',
        detail: `Your normalized GPA (${normalizedGpa.toFixed(2)}/4.00) meets the ${opportunity.minGpa.toFixed(2)} minimum.`,
      });
    } else if (normalizedGpa >= opportunity.minGpa - 0.15) {
      reasons.push({
        criterion: 'Academic GPA',
        status: 'advisory',
        detail: `Your normalized GPA (${normalizedGpa.toFixed(2)}/4.00) is slightly below ${opportunity.minGpa.toFixed(2)}; holistic review may still consider strong research or work experience.`,
      });
    } else {
      hasUnmet = true;
      reasons.push({
        criterion: 'Academic GPA',
        status: 'unmet',
        detail: `Your normalized GPA (${normalizedGpa.toFixed(2)}/4.00) is below the required ${opportunity.minGpa.toFixed(2)}/4.00 threshold.`,
      });
    }
  }

  // 4. Age check
  if (opportunity.minAge !== null || opportunity.maxAge !== null) {
    if (profile.age === null) {
      missingCount++;
      reasons.push({
        criterion: 'Age Limit',
        status: 'missing',
        detail: `Program specifies age criteria (${opportunity.minAge ?? 'any'}–${opportunity.maxAge ?? 'any'}).`,
      });
      nextSteps.push('Enter your age to verify age-bracket requirements.');
    } else {
      const belowMin = opportunity.minAge !== null && profile.age < opportunity.minAge;
      const aboveMax = opportunity.maxAge !== null && profile.age > opportunity.maxAge;
      if (belowMin || aboveMax) {
        hasUnmet = true;
        reasons.push({
          criterion: 'Age Limit',
          status: 'unmet',
          detail: `Age ${profile.age} falls outside the ${opportunity.minAge ?? 0}–${opportunity.maxAge ?? 'no limit'} requirement.`,
        });
      } else {
        reasons.push({
          criterion: 'Age Limit',
          status: 'met',
          detail: `Age ${profile.age} is within eligible range.`,
        });
      }
    }
  }

  // 5. English Proficiency
  const engCheck = hasSufficientEnglish(
    profile.englishProficiency,
    profile.englishScore,
    opportunity.englishReq
  );
  if (engCheck === 'met') {
    reasons.push({
      criterion: 'English Proficiency',
      status: 'met',
      detail: opportunity.englishReq || 'Meets language requirement.',
    });
  } else if (engCheck === 'missing') {
    missingCount++;
    reasons.push({
      criterion: 'English Proficiency',
      status: 'missing',
      detail: `Requires ${opportunity.englishReq}; your test type/score is not entered.`,
    });
    nextSteps.push(`Add your English test details (${opportunity.englishReq}).`);
  } else {
    hasUnmet = true;
    reasons.push({
      criterion: 'English Proficiency',
      status: 'unmet',
      detail: `Score (${profile.englishProficiency} ${profile.englishScore}) is below ${opportunity.englishReq}.`,
    });
  }

  // 6. Financial preference & Country of residence advisory
  if (profile.financialNeed === 'full_funding' && opportunity.fundingType !== 'fully_funded' && opportunity.fundingType !== 'paid_stipend') {
    reasons.push({
      criterion: 'Funding Alignment',
      status: 'advisory',
      detail: `This opportunity is ${opportunity.fundingType.replace('_', ' ')}, whereas your preference is full funding.`,
    });
  } else {
    reasons.push({
      criterion: 'Funding Alignment',
      status: 'met',
      detail: `${opportunity.fundingAmount} aligns with your financial preferences.`,
    });
  }

  if (profile.countryOfResidence) {
    reasons.push({
      criterion: 'Residence Context',
      status: 'met',
      detail: `Applying from ${profile.countryOfResidence}; confirm local embassy/consular timeline details on the official portal.`,
    });
  }

  const hasAdvisory = reasons.some((r) => r.status === 'advisory');
  let status: EligibilityEvaluation['status'];
  if (hasUnmet) {
    status = 'NOT_ELIGIBLE';
  } else if (missingCount >= 2) {
    status = 'MISSING_INFO';
  } else if (missingCount === 1 || hasAdvisory) {
    status = 'POTENTIALLY_ELIGIBLE';
  } else {
    status = 'ELIGIBLE';
  }

  if (status === 'ELIGIBLE') {
    nextSteps.push('Review the official application portal and start tracking required documents in your Application Tracker.');
  } else if (status === 'POTENTIALLY_ELIGIBLE') {
    nextSteps.push('Verify remaining advisory or missing criteria directly on the official opportunity page before applying.');
  } else if (status === 'NOT_ELIGIBLE') {
    nextSteps.push('Explore alternative verified opportunities matched to your academic profile.');
  }

  const metCount = reasons.filter((r) => r.status === 'met').length;
  return {
    status,
    scoreLabel: `${metCount} of ${reasons.length} criteria verified`,
    reasons,
    recommendedNextSteps: nextSteps,
  };
}

export function computeMatchIntelligence(
  profile: StudentProfile | null,
  opportunity: OpportunityRecord,
  eligibility: EligibilityEvaluation | null
): OpportunityMatchIntelligence {
  const deadlineMs = new Date(opportunity.deadline).getTime();
  const daysRemaining = Number.isNaN(deadlineMs)
    ? null
    : Math.ceil((deadlineMs - Date.now()) / (1000 * 60 * 60 * 24));

  let deadlineUrgency: OpportunityMatchIntelligence['deadlineUrgency'] = 'Long Horizon';
  if (daysRemaining !== null) {
    if (daysRemaining < 0) deadlineUrgency = 'Expired';
    else if (daysRemaining <= 14) deadlineUrgency = 'Urgent';
    else if (daysRemaining <= 60) deadlineUrgency = 'Upcoming';
    else deadlineUrgency = 'Long Horizon';
  }

  let fundingCompatibility: OpportunityMatchIntelligence['fundingCompatibility'] = 'Unspecified';
  if (profile) {
    if (profile.financialNeed === 'full_funding') {
      fundingCompatibility =
        opportunity.fundingType === 'fully_funded' || opportunity.fundingType === 'paid_stipend'
          ? 'Aligned'
          : opportunity.fundingType === 'partially_funded' || opportunity.fundingType === 'prize_pool'
          ? 'Partial'
          : 'Mismatch';
    } else if (profile.financialNeed === 'partial_funding') {
      fundingCompatibility = opportunity.fundingType === 'unfunded' ? 'Mismatch' : 'Aligned';
    } else {
      fundingCompatibility = 'Aligned';
    }
  }

  let academicCompatibility = 'Complete your profile for academic alignment';
  if (profile) {
    if (opportunity.minGpa === null) {
      academicCompatibility =
        opportunity.educationLevel === 'all' || opportunity.educationLevel === profile.educationLevel
          ? 'Open academic threshold · Level aligned'
          : `Targets ${opportunity.educationLevel.replace('_', ' ')}`;
    } else if (profile.gpa === null) {
      academicCompatibility = `Requires ${opportunity.minGpa.toFixed(2)}/4.00 GPA (profile GPA not set)`;
    } else {
      const norm = normalizeGpaTo4(profile.gpa, profile.gpaScale || 4.0);
      academicCompatibility =
        norm >= opportunity.minGpa
          ? `GPA ${norm.toFixed(2)}/4.00 exceeds ${opportunity.minGpa.toFixed(2)} cutoff`
          : `GPA ${norm.toFixed(2)}/4.00 below ${opportunity.minGpa.toFixed(2)} cutoff`;
    }
  }

  const missingRequirements = eligibility
    ? eligibility.reasons
        .filter((r) => r.status === 'missing' || r.status === 'unmet')
        .map((r) => `${r.criterion}: ${r.detail}`)
    : ['Sign in and complete your Eligibility Profile to check personal fit.'];

  const eligibilityMatch = eligibility ? eligibility.status : 'UNASSESSED';
  let explanation = 'Sign in to generate personalized eligibility, funding, and academic fit reasoning.';
  if (eligibility) {
    const met = eligibility.reasons.filter((r) => r.status === 'met').length;
    const total = eligibility.reasons.length;
    explanation = `${met} of ${total} eligibility checks satisfied; funding is ${fundingCompatibility.toLowerCase()} and deadline window is ${deadlineUrgency.toLowerCase()}.`;
  }

  return {
    eligibilityMatch,
    fundingCompatibility,
    academicCompatibility,
    deadlineUrgency,
    daysRemaining,
    missingRequirements,
    explanation,
  };
}

export function buildTrustProfile(
  opportunity: OpportunityRecord,
  stats: { reportCount: number; evidenceCount: number; flagCount: number }
): OpportunityTrustProfile {
  let officialDomain = 'unknown-domain';
  try {
    officialDomain = new URL(opportunity.officialUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    officialDomain = 'invalid-or-unlisted-domain';
  }

  let domainClassification = 'Custom domain; ownership has not been independently confirmed';
  if (
    officialDomain.endsWith('.gov') ||
    officialDomain.endsWith('.go.jp') ||
    officialDomain.endsWith('.admin.ch') ||
    officialDomain.endsWith('.europa.eu') ||
    officialDomain.includes('.gov.')
  ) {
    domainClassification = 'Government-domain suffix signal; program ownership is not confirmed';
  } else if (
    officialDomain.endsWith('.edu') ||
    officialDomain.endsWith('.ac.uk')
  ) {
    domainClassification = 'Academic-domain suffix signal; accreditation is not independently checked';
  } else if (officialDomain.endsWith('.org')) {
    domainClassification = 'Organization-style .org domain; nonprofit status is not established';
  }

  let riskSummary =
    'No community reports are currently recorded. Absence of reports is not evidence of safety; independently confirm the organization and opportunity details.';
  if (opportunity.verificationStatus === 'CONTRADICTED') {
    riskSummary = 'A linked verification report contains contradictions. Do not pay fees or submit sensitive documents until the issues are resolved.';
  } else if (
    opportunity.verificationStatus === 'UNVERIFIED' ||
    opportunity.verificationStatus === 'INSUFFICIENT_EVIDENCE'
  ) {
    riskSummary = 'Available verification evidence is limited or insufficient. Confirm the opportunity directly with the organization before applying.';
  } else if (stats.flagCount > 0) {
    riskSummary = `${stats.flagCount} community report(s) have been submitted. This count does not indicate whether reports were upheld or dismissed; review moderation outcomes before applying.`;
  }

  return {
    organizationIdentity: opportunity.organization,
    officialDomain,
    domainClassification,
    verificationHistoryCount: stats.reportCount,
    evidenceSourcesCount: stats.evidenceCount,
    communityFlagCount: stats.flagCount,
    lastCheckedAt: opportunity.lastVerifiedAt,
    riskSummary,
  };
}

export function computeOpportunityIntelligenceScore(
  profile: StudentProfile | null,
  opportunities: OpportunityRecord[],
  userReports: Array<{ overall_status: string }>,
  applications: Array<{ status: string; checklist_json: string }>
): OpportunityIntelligenceScore {
  // 1. Profile Completeness (0–30 pts)
  let profileFieldsMet = 0;
  const totalProfileFields = 7;
  if (profile) {
    if (profile.nationality) profileFieldsMet++;
    if (profile.countryOfResidence) profileFieldsMet++;
    if (profile.educationLevel) profileFieldsMet++;
    if (profile.gpa !== null) profileFieldsMet++;
    if (profile.englishProficiency) profileFieldsMet++;
    if (profile.targetCountries.length > 0) profileFieldsMet++;
    if (profile.academicInterests.length > 0) profileFieldsMet++;
  }
  const profileScore = Math.round((profileFieldsMet / totalProfileFields) * 30);

  // 2. Verified Match Coverage (0–30 pts)
  let eligibleCount = 0;
  const verifiedPool = opportunities.filter(
    (o) => o.verificationStatus === 'VERIFIED' || o.verificationStatus === 'SUPPORTED'
  );
  for (const opp of verifiedPool) {
    const res = evaluateEligibility(profile, opp);
    if (res.status === 'ELIGIBLE') eligibleCount += 1;
    else if (res.status === 'POTENTIALLY_ELIGIBLE') eligibleCount += 0.5;
  }
  const matchRatio = verifiedPool.length > 0 ? Math.min(1, eligibleCount / Math.max(3, verifiedPool.length * 0.5)) : 0;
  const matchScore = Math.round(matchRatio * 30);

  // 3. Application Readiness (0–25 pts)
  let appScore = 0;
  let appExplanation = 'No active applications tracked yet; add an opportunity to your pipeline.';
  if (applications.length > 0) {
    let totalChecks = 0;
    let doneChecks = 0;
    for (const a of applications) {
      try {
        const list = JSON.parse(a.checklist_json || '[]') as Array<{ done: boolean }>;
        totalChecks += list.length;
        doneChecks += list.filter((c) => c.done).length;
      } catch {
        // skip
      }
    }
    const readinessRatio = totalChecks > 0 ? doneChecks / totalChecks : 0.4;
    appScore = Math.round(10 + readinessRatio * 15);
    appExplanation = `${doneChecks} of ${totalChecks} application checklist steps completed across ${applications.length} tracked application(s).`;
  }

  // 4. Verification & Safety Hygiene (0–15 pts)
  const contradictedCount = userReports.filter((r) => r.overall_status === 'CONTRADICTED').length;
  let hygieneScore = userReports.length > 0 ? 12 : 6;
  if (userReports.length >= 2) hygieneScore = 15;
  if (contradictedCount > 0 && userReports.length === contradictedCount) hygieneScore = 10;

  const totalScore = Math.min(100, profileScore + matchScore + appScore + hygieneScore);

  return {
    totalScore,
    components: [
      {
        label: 'Profile Completeness',
        score: profileScore,
        maxScore: 30,
        explanation: `${profileFieldsMet} of ${totalProfileFields} core eligibility attributes configured.`,
      },
      {
        label: 'Verified Match Coverage',
        score: matchScore,
        maxScore: 30,
        explanation: `${eligibleCount.toFixed(1)} weighted matches across ${verifiedPool.length} verified directory opportunities.`,
      },
      {
        label: 'Application Readiness',
        score: appScore,
        maxScore: 25,
        explanation: appExplanation,
      },
      {
        label: 'Verification Hygiene',
        score: hygieneScore,
        maxScore: 15,
        explanation:
          userReports.length > 0
            ? `${userReports.length} independent verification audit(s) logged in your workspace.`
            : 'Run your first live URL or PDF verification audit to reach full safety score.',
      },
    ],
    formulaSummary:
      'Calculated transparently from Profile Completeness (30), Verified Match Coverage (30), Application Readiness (25), and Verification Hygiene (15).',
  };
}
