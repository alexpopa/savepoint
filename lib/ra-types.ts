import type { CatalogGame } from "./game-types";

// One main RetroAchievements game with its subsets folded in.
export type RaGame = {
  gameId: number; subsetIds: number[]; name: string; consoleId: number; consoleName: string; imageUrl: string | null;
  earned: number; earnedHardcore: number; total: number; lastPlayedAt: number | null; completedAt: number | null; completedHardcore: boolean;
};
export type RaPreview = {
  gameId: number; name: string; consoleName: string; imageUrl: string | null; lastPlayedAt: number | null; playSeconds: number | null;
  earned: number; earnedHardcore: number; total: number; completedAt: number | null; completedHardcore: boolean;
  game: CatalogGame | null; matchedAt: number | null; importedAt: number | null; libraryItemId: number | null;
  playingSince: number | null; available: boolean; existingPlatforms: number[];
};
export type RaLink = { username: string; code: string; expiresAt: number };
export type RaState = {
  configured: boolean;
  link: RaLink | null;
  connection: { username: string; syncedAt: number | null; attemptedAt: number | null; syncError: string | null; paused: boolean; playtimeOffers: number } | null;
  games: RaPreview[];
  total: number;
  pending: number;
  ready: number;
  unresolved: number;
  imported: number;
  achievementsPending: number;
  page: number;
};
export type RaAchievement = {
  id: number; setName: string | null; title: string; description: string | null; badgeUrl: string | null; points: number;
  rarity: number | null; earnedAt: number | null; hardcore: boolean;
};
export type RaShowcaseGame = {
  gameRowId: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null;
  earned: number; total: number; playSeconds: number | null; lastPlayedAt: number | null; completedAt: number | null; completedHardcore: boolean;
};
// Account-wide RetroAchievements totals. All are stored; profiles show only the beaten count for now.
export type RaShowcaseTotals = {
  games: number; hardcorePoints: number; softcorePoints: number; retroPoints: number;
  beatenHardcore: number; beatenSoftcore: number; mastered: number; completed: number;
};

// IGDB platforms for each RetroAchievements console, the usual release first. Consoles without one (Standalone) stay unresolved.
export const raConsolePlatforms: Record<number, number[]> = {
  1: [29], 2: [4], 3: [19, 58], 4: [33], 5: [24], 6: [22], 7: [18, 99], 8: [86, 128], 9: [78], 10: [30], 11: [64], 12: [7], 13: [61], 14: [119, 120],
  15: [35], 16: [21], 17: [62], 18: [20], 19: [5], 20: [41], 21: [8], 22: [11], 23: [133], 24: [166], 25: [59], 26: [13], 27: [52, 79, 80], 28: [87],
  29: [27, 53], 30: [15], 31: [373], 33: [84], 34: [71], 35: [16], 36: [63], 37: [25], 38: [75], 39: [32], 40: [23], 41: [38], 42: [117], 43: [50],
  44: [68], 45: [67], 46: [70], 47: [125], 48: [149], 49: [274], 50: [66], 51: [60], 52: [121], 53: [57, 123], 54: [375], 55: [376], 56: [136],
  57: [127], 58: [118], 59: [26], 60: [307], 61: [42], 62: [37, 137], 63: [415], 64: [77], 67: [157], 68: [339], 69: [408], 70: [240], 71: [438],
  73: [473], 74: [138], 75: [505], 76: [150], 77: [410], 78: [159, 20], 80: [504], 81: [51], 82: [9],
};
export const raPlatformIds = [...new Set(Object.values(raConsolePlatforms).flat())];

export function raPlatforms(game: CatalogGame) { return game.platformOptions.filter((platform) => raPlatformIds.includes(platform.id)); }

// The game's own console comes first: an existing copy on it, then its usual release, then any existing supported copy, then any supported platform.
export function defaultRaPlatform(game: CatalogGame, consoleId: number, existingPlatforms: number[] = []) {
  const supported = new Set(raPlatforms(game).map((platform) => platform.id));
  const own = raConsolePlatforms[consoleId] ?? [];
  return own.find((id) => supported.has(id) && existingPlatforms.includes(id)) ?? own.find((id) => supported.has(id))
    ?? raPlatformIds.find((id) => supported.has(id) && existingPlatforms.includes(id)) ?? raPlatformIds.find((id) => supported.has(id)) ?? 0;
}

const subsetPattern = /^(.*\S)\s+\[Subset - (.+)\]$/;
// "Final Fantasy V: Advance [Subset - Four Job Fiesta]" -> the main title and the subset's name.
export function raSubset(title: string) {
  const match = subsetPattern.exec(title);
  return match ? { base: match[1], name: match[2] } : null;
}

// Titles to look up on IGDB: without RA's ~Hack~ style tags, each half of "A | B", with a trailing article
// moved to the front ("Legend of Zelda, The: …"), and without colons, which IGDB often omits.
export function raTitleVariants(title: string) {
  const variants = new Set<string>();
  for (const part of title.replace(/^(~[^~]+~\s*)+/, "").split(" | ")) {
    const name = part.trim();
    if (!name) continue;
    const article = /^(.*?), (The|A|An)(:.*| - .*)?$/.exec(name);
    for (const value of [name, ...(article ? [`${article[2]} ${article[1]}${article[3] ?? ""}`] : [])]) {
      variants.add(value);
      if (value.includes(":")) variants.add(value.replace(/\s*:\s*/g, " ").replace(/\s+/g, " "));
    }
  }
  return [...variants].filter((name) => name.length <= 200 && !/[\r\n]/.test(name));
}
// Compares titles without case, accents, or punctuation.
export function raTitleName(name: string) { return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

export const validRaGameId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 10_000_000;
export const validRaUsername = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_.-]{2,32}$/.test(value);
