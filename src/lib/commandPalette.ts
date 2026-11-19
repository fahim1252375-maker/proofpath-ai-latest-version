export interface CommandPaletteEntry {
  id: string;
  label: string;
  description: string;
  keywords?: string;
  path: string;
}

/**
 * Filters workspace commands with a forgiving, deterministic search.
 * Label matches rank ahead of description/keyword matches; ties retain source order.
 */
export function filterCommandPaletteEntries<T extends CommandPaletteEntry>(
  entries: readonly T[],
  query: string
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...entries];

  const terms = normalized.split(/\s+/).filter(Boolean);
  return entries
    .map((entry, index) => {
      const label = entry.label.toLocaleLowerCase();
      const searchable = [entry.label, entry.description, entry.keywords ?? '', entry.path]
        .join(' ')
        .toLocaleLowerCase();
      if (!terms.every((term) => searchable.includes(term))) return null;
      const rank = label === normalized ? 0 : label.startsWith(normalized) ? 1 : label.includes(normalized) ? 2 : 3;
      return { entry, index, rank };
    })
    .filter((item): item is { entry: T; index: number; rank: number } => item !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.entry);
}

export function buildOpportunitySearchPath(query: string): string {
  const normalized = query.trim();
  return normalized ? `/opportunities?q=${encodeURIComponent(normalized)}` : '/opportunities';
}
