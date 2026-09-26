import { getCurrentUser } from "../auth";
import SiteHeader from "../site-header";
import SearchResults from "./search-results";
import { ensureAccount } from "../../lib/social";
import { getPopularRecentGames } from "../../lib/popular-games";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; platform?: string | string[] }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const requestedPlatformIds = Array.isArray(params.platform) ? params.platform : params.platform ? [params.platform] : [];
  const initialPlatformIds = [...new Set(requestedPlatformIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const user = await getCurrentUser();
  if (user) await ensureAccount(user);
  let popularGames: Awaited<ReturnType<typeof getPopularRecentGames>> = [];
  let popularGamesError = false;
  if (!query) {
    try { popularGames = await getPopularRecentGames(); }
    catch (error) { console.error("Could not load popular recent games", error); popularGamesError = true; }
  }
  return <main className="library-page"><SiteHeader email={user?.email} query={query}/><SearchResults key={query} query={query} signedIn={Boolean(user)} initialPlatformIds={initialPlatformIds} popularGames={popularGames} popularGamesError={popularGamesError}/></main>;
}
