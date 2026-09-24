import { getCurrentUser } from "../auth";
import SiteHeader from "../site-header";
import SearchResults from "./search-results";
import { ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; platform?: string | string[] }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const requestedPlatformIds = Array.isArray(params.platform) ? params.platform : params.platform ? [params.platform] : [];
  const initialPlatformIds = [...new Set(requestedPlatformIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const user = await getCurrentUser();
  if (user) await ensureAccount(user);
  return <main className="library-page"><SiteHeader email={user?.email} query={query} platformIds={initialPlatformIds}/><SearchResults key={query} query={query} signedIn={Boolean(user)} initialPlatformIds={initialPlatformIds}/></main>;
}
