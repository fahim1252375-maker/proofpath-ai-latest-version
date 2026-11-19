export const STUDENT_JOURNEYS = [
  { id: 'high_school', label: 'High school student', educationLevel: 'high_school' },
  { id: 'undergraduate', label: 'Undergraduate student', educationLevel: 'undergraduate' },
  { id: 'graduate_applicant', label: 'Graduate applicant', educationLevel: 'masters' },
  { id: 'masters_applicant', label: "Master's applicant", educationLevel: 'masters' },
  { id: 'phd_research', label: 'PhD / research applicant', educationLevel: 'phd' },
  { id: 'early_career', label: 'Early-career applicant', educationLevel: 'all' },
] as const;

/** Student subject taxonomy is guidance-only and intentionally separate from opportunity categories. */
export const ACADEMIC_DISCIPLINES = [
  { id: 'it_computer_science', label: 'IT & Computer Science', subfields: ['Computer Science', 'Software Engineering', 'Information Technology', 'Cybersecurity', 'Artificial Intelligence', 'Data Science', 'Information Systems'] },
  { id: 'engineering', label: 'Engineering', subfields: ['Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Electronics', 'Chemical Engineering', 'Biomedical Engineering', 'Environmental Engineering', 'Aerospace Engineering'] },
  { id: 'medicine_health', label: 'Medicine & Health Sciences', subfields: ['Medicine', 'Nursing', 'Public Health', 'Pharmacy', 'Biomedical Sciences', 'Dentistry', 'Allied Health'] },
  { id: 'business_economics', label: 'Business & Economics', subfields: ['Business Administration', 'Economics', 'Finance', 'Accounting', 'Marketing', 'Entrepreneurship'] },
  { id: 'law_public_policy', label: 'Law & Public Policy', subfields: ['Law', 'Public Policy', 'International Relations', 'Public Administration'] },
  { id: 'natural_sciences', label: 'Natural Sciences', subfields: ['Biology', 'Chemistry', 'Physics', 'Earth Sciences', 'Environmental Science'] },
  { id: 'mathematics_statistics', label: 'Mathematics & Statistics', subfields: ['Mathematics', 'Statistics', 'Applied Mathematics', 'Operations Research'] },
  { id: 'architecture_design', label: 'Architecture & Design', subfields: ['Architecture', 'Urban Planning', 'Graphic Design', 'Industrial Design', 'Interaction Design'] },
  { id: 'agriculture_environment', label: 'Agriculture & Environment', subfields: ['Agriculture', 'Food Systems', 'Environmental Management', 'Forestry', 'Climate Studies'] },
  { id: 'education', label: 'Education', subfields: ['Teaching', 'Education Policy', 'Learning Sciences', 'Educational Technology'] },
  { id: 'arts_humanities', label: 'Arts & Humanities', subfields: ['History', 'Languages', 'Literature', 'Philosophy', 'Visual Arts', 'Music'] },
  { id: 'social_sciences', label: 'Social Sciences', subfields: ['Sociology', 'Psychology', 'Political Science', 'Anthropology', 'Development Studies'] },
] as const;

export const OPPORTUNITY_GOALS = [
  { id: 'undergraduate_scholarship', label: 'Undergraduate scholarship', category: 'scholarship', educationLevel: 'undergraduate', explanation: 'Uses the catalogue scholarship category and undergraduate level filters.' },
  { id: 'masters_scholarship', label: "Master's scholarship", category: 'scholarship', educationLevel: 'masters', explanation: 'Uses the catalogue scholarship category and master’s level filters.' },
  { id: 'phd_funding', label: 'PhD funding', category: 'all', educationLevel: 'phd', explanation: 'Uses the PhD level filter across supported catalogue categories.' },
  { id: 'research_fellowship', label: 'Research fellowship', category: 'fellowship', educationLevel: 'phd', explanation: 'Uses the fellowship category and PhD level filters.' },
  { id: 'internship', label: 'Internship', category: 'internship', educationLevel: 'all', explanation: 'Uses the catalogue internship category.' },
  { id: 'competition', label: 'International competition', category: 'competition', educationLevel: 'all', explanation: 'Uses the catalogue competition category.' },
  { id: 'education_grant', label: 'Education grant', category: 'grant', educationLevel: 'all', explanation: 'Uses the catalogue grant category.' },
  { id: 'graduate_opportunity', label: 'Graduate opportunity', category: 'all', educationLevel: 'masters', explanation: 'Uses the master’s level filter across supported catalogue categories.' },
] as const;

export const FUNDING_PREFERENCES = [
  { id: 'fully_funded', label: 'Fully funded', filter: 'fully_funded' },
  { id: 'partially_funded', label: 'Partially funded', filter: 'partially_funded' },
  { id: 'stipend', label: 'Stipend-supported', filter: 'paid_stipend' },
  { id: 'tuition', label: 'Tuition support', filter: 'partially_funded' },
  { id: 'prize', label: 'Prize / grant-based', filter: 'prize_pool' },
  { id: 'unspecified', label: 'Funding not specified', filter: 'all' },
] as const;

export interface OpportunityFilterSelection {
  category?: string;
  educationLevel?: string;
  fundingType?: string;
  country?: string;
  deadlineBefore?: string;
}

/** Builds only parameters accepted by the existing /api/opportunities route. */
export function buildOpportunityFilterPath(selection: OpportunityFilterSelection): string {
  const params = new URLSearchParams();
  for (const key of ['category', 'educationLevel', 'fundingType', 'country', 'deadlineBefore'] as const) {
    const value = selection[key]?.trim();
    if (value && value !== 'all') params.set(key, value);
  }
  return params.size ? `/opportunities?${params.toString()}` : '/opportunities';
}
