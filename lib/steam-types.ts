import type { CatalogGame } from "./game-types";
import type { SteamGame } from "./steam-api";

export type SteamPreview = SteamGame & { game: CatalogGame | null; matchedAt: number | null; ignored: boolean; importedAt: number | null; libraryItemId: number | null; available: boolean; existingPlatforms: number[] };
export type SteamState = {
  configured: boolean;
  connection: { steamId: string; syncedAt: number | null; attemptedAt: number | null; activityAt: number | null; syncError: string | null; paused: boolean; playtimeOffers: number } | null;
  games: SteamPreview[];
  recent: SteamGame[] | null;
  total: number;
  pending: number;
  ready: number;
  review: number;
  imported: number;
  page: number;
};
export const steamPlatformIds = [163, 6, 14, 3];

// Preserve an existing supported copy; otherwise prefer SteamVR for a VR release, then desktop.
export function steamPlatforms(game: CatalogGame) { return game.platformOptions.filter((platform) => steamPlatformIds.includes(platform.id)); }

export function defaultSteamPlatform(game: CatalogGame, existingPlatforms: number[] = []) {
  const supported = new Set(steamPlatforms(game).map((platform) => platform.id));
  return steamPlatformIds.find((id) => supported.has(id) && existingPlatforms.includes(id))
    ?? steamPlatformIds.find((id) => supported.has(id)) ?? 0;
}
