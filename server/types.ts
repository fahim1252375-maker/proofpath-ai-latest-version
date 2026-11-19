export type UserRole = 'student' | 'moderator' | 'admin';

export type VerificationStatus =
  | 'VERIFIED'
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'UNVERIFIED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXPIRED';

export type EligibilityStatus =
  | 'ELIGIBLE'
  | 'POTENTIALLY_ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'MISSING_INFO';

export type OpportunityCategory =
  | 'scholarship'
  | 'internship'
  | 'competition'
  | 'fellowship'
  | 'grant';

export type EducationLevel =
  | 'high_school'
  | 'undergraduate'
  | 'masters'
  | 'phd'
  | 'all';

export type FundingType =
  | 'fully_funded'
  | 'partially_funded'
  | 'paid_stipend'
  | 'prize_pool'
  | 'unfunded';

export type ApplicationStatus =
  | 'researching'
  | 'preparing'
  | 'submitted'
  | 'interview'
  | 'accepted'
  | 'rejected';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: number;
  preferred_language: 'en' | 'bn';
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  isActive: boolean;
  preferredLanguage: 'en' | 'bn';
  createdAt: string;
}

export interface StudentProfile {
  userId: string;
  nationality: string;
  countryOfResidence: string;
  age: number | null;
  educationLevel: EducationLevel | '';
  gpa: number | null;
  gpaScale: number;
  englishProficiency: string;
  englishScore: string;
  financialNeed: 'full_funding' | 'partial_funding' | 'self_funded' | 'any';
  academicInterests: string[];
  targetCountries: string[];
  updatedAt: string;
}

export interface OpportunityRecord {
  id: string;
  slug: string;
  title: string;
  organization: string;
  country: string;
  category: OpportunityCategory;
  educationLevel: EducationLevel;
  fundingType: FundingType;
  fundingAmount: string;
  minGpa: number | null;
  englishReq: string;
  eligibleNationalities: string[];
  minAge: number | null;
  maxAge: number | null;
  deadline: string;
  officialUrl: string;
  description: string;
  requirements: string[];
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimVerificationItem {
  claim: string;
  verdict: VerificationStatus;
  explanation: string;
  evidenceExcerpt: string;
  sourceUrl: string;
}

export interface RiskIndicator {
  severity: 'low' | 'medium' | 'high';
  flag: string;
  detail: string;
}

export interface ExtractedOpportunityInfo {
  title: string;
  organization: string;
  country: string;
  category: string;
  deadline: string;
  fundingAmount: string;
  officialUrl: string;
  feesMentioned: string;
}

export interface VerificationReportDTO {
  id: string;
  userId: string | null;
  opportunityId: string | null;
  inputType: 'url' | 'text' | 'file';
  submittedUrl: string | null;
  submittedTitle: string | null;
  fileName: string | null;
  overallStatus: VerificationStatus;
  summary: string;
  extractedInfo: ExtractedOpportunityInfo;
  claims: ClaimVerificationItem[];
  evidenceSources: Array<{
    claimIndex: number;
    sourceUrl: string;
    sourceTitle: string;
    excerpt: string;
    stance: 'supports' | 'contradicts' | 'neutral';
    retrievedAt: string;
    credibility?: {
      score: number;
      level: 'strong' | 'moderate' | 'limited';
      host: string;
      signals: string[];
      caveat: string;
    };
  }>;
  riskIndicators: RiskIndicator[];
  confidenceLimitations: string;
  recommendedActions: string[];
  isSaved: boolean;
  createdAt: string;
}

export interface EligibilityCriterionResult {
  criterion: string;
  status: 'met' | 'unmet' | 'missing' | 'advisory';
  detail: string;
}

export interface EligibilityEvaluation {
  status: EligibilityStatus;
  scoreLabel: string;
  reasons: EligibilityCriterionResult[];
  recommendedNextSteps: string[];
}

export interface OpportunityMatchIntelligence {
  eligibilityMatch: EligibilityStatus | 'UNASSESSED';
  fundingCompatibility: 'Aligned' | 'Partial' | 'Mismatch' | 'Unspecified';
  academicCompatibility: string;
  deadlineUrgency: 'Urgent' | 'Upcoming' | 'Long Horizon' | 'Expired';
  daysRemaining: number | null;
  missingRequirements: string[];
  explanation: string;
}

export interface OpportunityTrustProfile {
  organizationIdentity: string;
  officialDomain: string;
  domainClassification: string;
  verificationHistoryCount: number;
  evidenceSourcesCount: number;
  communityFlagCount: number;
  lastCheckedAt: string;
  riskSummary: string;
}

export interface OpportunityIntelligenceScore {
  totalScore: number;
  components: Array<{
    label: string;
    score: number;
    maxScore: number;
    explanation: string;
  }>;
  formulaSummary: string;
}
