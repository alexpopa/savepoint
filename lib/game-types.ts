export type PlatformOption = { id: number; name: string };

export type CatalogGame = {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  platforms: string[];
  platformOptions: PlatformOption[];
  releaseDate?: string | null;
  summary?: string | null;
  storyline?: string | null;
  genres?: string[];
  gameModes?: string[];
  perspectives?: string[];
  themes?: string[];
  developers?: string[];
  publishers?: string[];
  rating?: number | null;
  ratingCount?: number | null;
  screenshotUrls?: string[];
};

export type SavedGame = Omit<CatalogGame, "platformOptions"> & {
  id: number;
  platformId: number;
  platformName: string | null;
};
