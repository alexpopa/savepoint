import type { CatalogGame } from "./game-types";

export type XboxTitle = {
  titleId: number; name: string; imageUrl: string | null; productId: string | null; devices: string[]; lastPlayedAt: number | null;
  currentAchievements: number; totalAchievements: number; currentGamerscore: number; totalGamerscore: number; achievementVersion: 1 | 2;
};
export type XboxPreview = Omit<XboxTitle, "productId" | "achievementVersion"> & {
  game: CatalogGame | null; matchedAt: number | null; importedAt: number | null; libraryItemId: number | null;
  playingSince: number | null; available: boolean; existingPlatforms: number[];
};
export type XboxState = {
  configured: boolean;
  connection: { gamertag: string; syncedAt: number | null; attemptedAt: number | null; syncError: string | null } | null;
  games: XboxPreview[];
  total: number;
  pending: number;
  ready: number;
  unresolved: number;
  imported: number;
  achievementsPending: number;
  page: number;
};
export type XboxAchievement = {
  id: string; name: string; description: string | null; iconUrl: string | null; gamerscore: number;
  isSecret: boolean; rarity: number | null; unlockedAt: number | null;
};
export type XboxShowcaseGame = {
  titleRowId: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null;
  currentAchievements: number; totalAchievements: number; currentGamerscore: number; totalGamerscore: number; lastPlayedAt: number | null; completedAt: number | null;
};

// IGDB platforms an Xbox title can be imported to, newest console first.
export const xboxPlatformIds = [169, 49, 12, 6];
const devicePlatforms: Record<string, number> = { XboxSeries: 169, Scarlett: 169, XboxOne: 49, Durango: 49, Xbox360: 12, PC: 6, Win32: 6 };

export function xboxPlatforms(game: CatalogGame) { return game.platformOptions.filter((platform) => xboxPlatformIds.includes(platform.id)); }
export function devicePlatformIds(devices: string[]) { return [...new Set(devices.flatMap((device) => devicePlatforms[device] ? [devicePlatforms[device]] : []))]; }

// Preserve an existing supported copy, then prefer the newest platform the player actually used, then the newest listed.
export function defaultXboxPlatform(game: CatalogGame, devices: string[] = [], existingPlatforms: number[] = []) {
  const supported = new Set(xboxPlatforms(game).map((platform) => platform.id));
  const played = devicePlatformIds(devices);
  return xboxPlatformIds.find((id) => supported.has(id) && existingPlatforms.includes(id))
    ?? xboxPlatformIds.find((id) => supported.has(id) && played.includes(id))
    ?? xboxPlatformIds.find((id) => supported.has(id)) ?? 0;
}

// Xbox 360 marketplace IDs embed the hexadecimal title ID; IGDB stores them in two formats.
export function xbox360MarketplaceIds(titleId: number) {
  const guid = `66acd000-77fe-1000-9115-d802${titleId.toString(16).padStart(8, "0")}`;
  return [guid, `xbox360${guid}`];
}
