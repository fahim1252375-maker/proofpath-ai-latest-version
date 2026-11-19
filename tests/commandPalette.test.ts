import { describe, expect, it } from 'vitest';
import { buildOpportunitySearchPath, filterCommandPaletteEntries } from '../src/lib/commandPalette.ts';

const entries = [
  { id: 'dashboard', label: 'Command Center', description: 'Personal overview', keywords: 'home workspace', path: '/dashboard' },
  { id: 'discover', label: 'Discover Opportunities', description: 'Search the catalog', keywords: 'scholarships internships funding', path: '/opportunities' },
  { id: 'verify', label: 'Verify Evidence', description: 'Check source claims', keywords: 'trust audit', path: '/verify' },
  { id: 'applications', label: 'Applications', description: 'Track your pipeline', keywords: 'kanban deadlines', path: '/dashboard/applications' },
];

describe('command palette search', () => {
  it('returns all commands for an empty query', () => {
    expect(filterCommandPaletteEntries(entries, '  ')).toEqual(entries);
  });

  it('matches labels without case sensitivity', () => {
    expect(filterCommandPaletteEntries(entries, 'VERIFY').map((entry) => entry.id)).toEqual(['verify']);
  });

  it('matches multiple terms across the searchable fields', () => {
    expect(filterCommandPaletteEntries(entries, 'scholarships funding').map((entry) => entry.id)).toEqual(['discover']);
  });

  it('ranks an exact label match ahead of broader matches', () => {
    const results = filterCommandPaletteEntries(entries, 'applications');
    expect(results[0]?.id).toBe('applications');
  });

  it('returns an empty list when there are no matches', () => {
    expect(filterCommandPaletteEntries(entries, 'quantum submarine')).toEqual([]);
  });
});

describe('opportunity search navigation', () => {
  it('opens the directory when the query is blank', () => {
    expect(buildOpportunitySearchPath('   ')).toBe('/opportunities');
  });

  it('encodes spaces and punctuation safely', () => {
    expect(buildOpportunitySearchPath('AI scholarships, Germany')).toBe(`/opportunities?q=${encodeURIComponent('AI scholarships, Germany')}`);
  });

  it('encodes Bengali queries without dropping Unicode characters', () => {
    expect(buildOpportunitySearchPath('বাংলাদেশ স্কলারশিপ')).toBe(`/opportunities?q=${encodeURIComponent('বাংলাদেশ স্কলারশিপ')}`);
  });
});
