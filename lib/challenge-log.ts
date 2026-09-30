export const challengeLogPageSize = 6;

type Searchable = { gameName: string; title: string; creatorName: string; recipientName: string };

// One search box matches the game, the challenge title, or either player's name.
export function filterChallenges<T extends Searchable>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => [row.gameName, row.title, row.creatorName, row.recipientName].some((text) => text.toLowerCase().includes(needle)));
}
