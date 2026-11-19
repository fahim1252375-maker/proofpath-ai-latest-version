import type Database from 'better-sqlite3';

/** Synthetic records used only by isolated API tests; no runtime database is seeded. */
export function insertTestOpportunities(db: Database.Database): void {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO opportunities (
      id, slug, title, organization, country, category, education_level, funding_type, funding_amount,
      min_gpa, english_req, eligible_nationalities_json, min_age, max_age, deadline, official_url,
      description, requirements_json, verification_status, last_verified_at, is_published, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
  `);

  const records = [
    ['opp_test_one', 'test-opportunity-one', 'Example Opportunity Alpha', 'Example Organization A', 'Example Country A', 'https://example.org/program-a'],
    ['opp_test_two', 'test-opportunity-two', 'Example Opportunity Beta', 'Example Organization B', 'Example Country B', 'https://example.org/program-b'],
    ['opp_test_three', 'test-opportunity-three', 'Example Opportunity Gamma', 'Example Organization C', 'Example Country C', 'https://example.org/program-c'],
    ['opp_test_four', 'test-opportunity-four', 'Example Opportunity Delta', 'Example Organization D', 'Example Country D', 'https://example.org/program-d'],
  ] as const;

  for (const [id, slug, title, organization, country, officialUrl] of records) {
    insert.run(
      id,
      slug,
      title,
      organization,
      country,
      'scholarship',
      'phd',
      'fully_funded',
      'Test fixture only',
      3.7,
      'IELTS 7.5',
      JSON.stringify(['Bangladesh']),
      18,
      35,
      '2099-01-05',
      officialUrl,
      'Synthetic test fixture. This is not a real scholarship or organization.',
      JSON.stringify([]),
      'INSUFFICIENT_EVIDENCE',
      now,
      now,
      now
    );
  }
}
