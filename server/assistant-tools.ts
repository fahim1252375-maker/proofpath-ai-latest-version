import { z } from 'zod';
import type Database from 'better-sqlite3';
import { mapOpportunityRow } from './db.ts';
import { evaluateEligibility } from './eligibility.ts';
import type { StudentProfile } from './types.ts';

export interface AssistantToolContext {
  db: Database.Database;
  userId: string;
  profile: StudentProfile | null;
}

const searchInput = z.object({
  today: z.iso.date(),
  limit: z.number().int().min(1).max(60).default(60),
});
const searchOutput = z.array(z.object({
  id: z.string(),
  title: z.string(),
  organization: z.string(),
  deadline: z.string(),
  officialUrl: z.string(),
  verificationStatus: z.string(),
  category: z.string(),
  fundingType: z.string(),
  fundingAmount: z.string(),
  eligibilityStatus: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE', 'MISSING_INFO']),
  nextStep: z.string(),
}));

const applicationsInput = z.object({
  today: z.iso.date(),
  limit: z.number().int().min(1).max(10).default(3),
});
const applicationsOutput = z.array(z.object({
  title: z.string(),
  organization: z.string(),
  status: z.string(),
  deadline: z.string(),
}));

const reportInput = z.object({ reportId: z.string().min(1).max(100) });
const reportOutput = z.object({
  title: z.string(),
  status: z.string(),
  summary: z.string(),
  limitations: z.string(),
  submittedUrl: z.string().nullable(),
});

export const assistantToolCatalog = [
  { id: 'search_published_opportunities', permission: 'published catalogue only', effects: 'read-only' },
  { id: 'read_eligibility_matches', permission: 'signed-in student profile + published catalogue', effects: 'read-only; uses evaluateEligibility' },
  { id: 'read_application_deadlines', permission: 'signed-in student application rows only', effects: 'read-only' },
  { id: 'explain_owned_verification', permission: 'signed-in student’s own report only', effects: 'read-only' },
] as const;

function opportunityMatches(row: Record<string, unknown>, profile: StudentProfile | null) {
  const opportunity = mapOpportunityRow(row);
  const evaluation = evaluateEligibility(profile, opportunity);
  return {
    id: opportunity.id,
    title: opportunity.title,
    organization: opportunity.organization,
    deadline: opportunity.deadline,
    officialUrl: opportunity.officialUrl,
    verificationStatus: opportunity.verificationStatus,
    category: opportunity.category,
    fundingType: opportunity.fundingType,
    fundingAmount: opportunity.fundingAmount,
    eligibilityStatus: evaluation.status,
    nextStep: evaluation.recommendedNextSteps[0] || '',
  };
}

/** Execute only the named, read-only ProofPath data operations. No model-selected SQL, shell, or external actions. */
export function runAssistantTool(
  name: string,
  context: AssistantToolContext,
  rawInput: unknown,
): unknown {
  if (name === 'search_published_opportunities' || name === 'read_eligibility_matches') {
    const input = searchInput.parse(rawInput);
    const rows = context.db.prepare(`
      SELECT * FROM opportunities
      WHERE is_published = 1 AND deadline >= ?
      ORDER BY deadline ASC LIMIT ?
    `).all(input.today, input.limit) as Array<Record<string, unknown>>;
    return searchOutput.parse(rows.map((row) => opportunityMatches(row, context.profile)));
  }

  if (name === 'read_application_deadlines') {
    const input = applicationsInput.parse(rawInput);
    const rows = context.db.prepare(`
      SELECT custom_title AS title, organization, status, deadline
      FROM applications
      WHERE user_id = ? AND deadline >= ?
      ORDER BY deadline ASC LIMIT ?
    `).all(context.userId, input.today, input.limit) as Array<Record<string, unknown>>;
    return applicationsOutput.parse(rows.map((row) => ({
      title: String(row.title),
      organization: String(row.organization),
      status: String(row.status),
      deadline: String(row.deadline),
    })));
  }

  if (name === 'explain_owned_verification') {
    const input = reportInput.parse(rawInput);
    const row = context.db.prepare(`
      SELECT submitted_title, submitted_url, overall_status, summary, confidence_limitations
      FROM verification_reports WHERE id = ? AND user_id = ?
    `).get(input.reportId, context.userId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return reportOutput.parse({
      title: String(row.submitted_title || 'Untitled submission'),
      status: String(row.overall_status),
      summary: String(row.summary || ''),
      limitations: String(row.confidence_limitations || ''),
      submittedUrl: row.submitted_url ? String(row.submitted_url) : null,
    });
  }

  throw new Error('Unknown or unavailable ProofPath assistant tool.');
}
