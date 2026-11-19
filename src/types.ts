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
  educationLevel: '' | 'high_school' | 'undergraduate' | 'masters' | 'phd' | 'all';
  gpa: number | null;
  gpaScale: number;
  englishProficiency: string;
  englishScore: string;
  financialNeed: 'full_funding' | 'partial_funding' | 'self_funded' | 'any';
  academicInterests: string[];
  targetCountries: string[];
  updatedAt: string;
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

export interface OpportunityItem {
  id: string;
  slug: string;
  title: string;
  organization: string;
  country: string;
  category: 'scholarship' | 'internship' | 'competition' | 'fellowship' | 'grant';
  educationLevel: 'high_school' | 'undergraduate' | 'masters' | 'phd' | 'all';
  fundingType: 'fully_funded' | 'partially_funded' | 'paid_stipend' | 'prize_pool' | 'unfunded';
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
  isSaved?: boolean;
  eligibility?: EligibilityEvaluation | null;
  matchIntelligence?: OpportunityMatchIntelligence;
  trustProfile?: OpportunityTrustProfile;
}

export interface VerificationReport {
  id: string;
  userId: string | null;
  opportunityId: string | null;
  inputType: 'url' | 'text' | 'file';
  submittedUrl: string | null;
  submittedTitle: string | null;
  fileName: string | null;
  overallStatus: VerificationStatus;
  summary: string;
  extractedInfo: {
    title: string;
    organization: string;
    country: string;
    category: string;
    deadline: string;
    fundingAmount: string;
    officialUrl: string;
    feesMentioned: string;
  };
  claims: Array<{
    claim: string;
    verdict: VerificationStatus;
    explanation: string;
    evidenceExcerpt: string;
    sourceUrl: string;
  }>;
  evidenceSources: Array<{
    claimIndex: number;
    sourceUrl: string;
    sourceTitle: string;
    excerpt: string;
    stance: 'supports' | 'contradicts' | 'neutral';
    retrievedAt: string;
    credibility: {
      score: number;
      level: 'strong' | 'moderate' | 'limited';
      host: string;
      signals: string[];
      caveat: string;
    };
  }>;
  riskIndicators: Array<{
    severity: 'low' | 'medium' | 'high';
    flag: string;
    detail: string;
  }>;
  confidenceLimitations: string;
  recommendedActions: string[];
  isSaved: boolean;
  createdAt: string;
}

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  docName: string;
  docType: string;
  isReady: boolean;
  notes: string;
  updatedAt: string;
}

export interface ApplicationItem {
  id: string;
  opportunityId: string | null;
  customTitle: string;
  organization: string;
  status: 'researching' | 'preparing' | 'submitted' | 'interview' | 'accepted' | 'rejected';
  deadline: string;
  notes: string;
  checklist: Array<{ id: string; label: string; done: boolean }>;
  activity: Array<{ timestamp: string; action: string }>;
  priority: 'high' | 'medium' | 'low';
  documents: ApplicationDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  type: 'deadline' | 'verification' | 'application' | 'security' | 'moderation';
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  language: 'en' | 'bn';
  contextOpportunityId: string | null;
  contextReportId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  groundingRefs: Array<{ title: string; url: string }>;
  responseMode?: 'guided' | 'gemini';
  provider?: 'guided' | 'gemini' | 'ollama' | 'openjarvis';
  createdAt: string;
}
