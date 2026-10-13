import type { CatalogGame } from "./game-types";

export type TrophyCounts = { bronze: number; silver: number; gold: number; platinum: number };
export type TrophyGrade = keyof TrophyCounts;
// One merged PlayStation game: a trophy list, a played PS4/PS5 title, or both.
// The key is the trophy list ID when there is one, otherwise `concept:<id>` from the played list.
export type PsnTitle = {
  titleKey: string; name: string; imageUrl: string | null; platforms: string[]; npCommunicationId: string | null; npServiceName: "trophy" | "trophy2" | null;
  conceptId: number | null; titleIds: string[]; lastPlayedAt: number | null; playSeconds: number | null;
  earned: TrophyCounts; defined: TrophyCounts; progress: number;
};
export type PsnPreview = {
  titleKey: string; name: string; imageUrl: string | null; platforms: string[]; lastPlayedAt: number | null; playSeconds: number | null;
  earnedTrophies: number; totalTrophies: number; hasPlatinum: boolean; platinumEarned: boolean;
  game: CatalogGame | null; matchedAt: number | null; importedAt: number | null; libraryItemId: number | null;
  playingSince: number | null; available: boolean; existingPlatforms: number[];
};
export type PsnState = {
  configured: boolean;
  connection: { onlineId: string; syncedAt: number | null; attemptedAt: number | null; syncError: string | null; paused: boolean; playtimeOffers: number; needsReconnect: boolean } | null;
  games: PsnPreview[];
  total: number;
  pending: number;
  ready: number;
  unresolved: number;
  imported: number;
  trophiesPending: number;
  page: number;
};
export type PsnTrophy = {
  id: number; groupId: string; name: string; description: string | null; iconUrl: string | null; grade: TrophyGrade;
  isHidden: boolean; rarity: number | null; earnedAt: number | null;
};
export type PsnShowcaseGame = {
  titleRowId: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null;
  earnedTrophies: number; totalTrophies: number;
  hasPlatinum: boolean; playSeconds: number | null; lastPlayedAt: number | null; completedAt: number | null;
};
export type PsnShowcaseTotals = { games: number; level: number | null; platinum: number; gold: number; silver: number; bronze: number; completed: number };

// IGDB platforms a PlayStation title can be added to, newest console first.
export const psnPlatformIds = [167, 48, 9, 46];
const sonyPlatforms: Record<string, number> = { PS5: 167, PS4: 48, PS3: 9, PSVITA: 46 };

export function psnPlatforms(game: CatalogGame) { return game.platformOptions.filter((platform) => psnPlatformIds.includes(platform.id)); }
export function sonyPlatformIds(platforms: string[]) { return [...new Set(platforms.flatMap((name) => sonyPlatforms[name] ? [sonyPlatforms[name]] : []))]; }

// The platform the player used comes first, so a PS4 version never links to a PS5 copy: an existing copy on a played
// platform, then the newest played platform, then an existing supported copy, then the newest listed.
export function defaultPsnPlatform(game: CatalogGame, platforms: string[] = [], existingPlatforms: number[] = []) {
  const supported = new Set(psnPlatforms(game).map((platform) => platform.id));
  const played = sonyPlatformIds(platforms);
  return psnPlatformIds.find((id) => supported.has(id) && played.includes(id) && existingPlatforms.includes(id))
    ?? psnPlatformIds.find((id) => supported.has(id) && played.includes(id))
    ?? psnPlatformIds.find((id) => supported.has(id) && existingPlatforms.includes(id))
    ?? psnPlatformIds.find((id) => supported.has(id)) ?? 0;
}

const platformLabels: Record<string, string> = { PS5: "PS5", PS4: "PS4", PS3: "PS3", PSVITA: "PS Vita", PSPC: "PC" };
export function sonyPlatformLabel(platforms: string[]) { return platforms.map((name) => platformLabels[name] ?? name).join(" / "); }
export function formatPlaytime(seconds: number | null) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  return hours ? `${hours.toLocaleString()}h played` : `${Math.max(1, Math.round(seconds / 60))}m played`;
}
// Sony stores names with trademark symbols and odd spacing; compare titles without them.
export function psnTitleName(name: string) { return name.replace(/[™®©]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export const validPsnTitleKey = (value: unknown): value is string => typeof value === "string" && /^(NPWR\d{5}_\d{2}|concept:\d{1,15}|title:[A-Z]{4}\d{5}_\d{2})$/.test(value);
