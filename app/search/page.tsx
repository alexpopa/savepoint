import { getCurrentUser } from "../auth";
import SiteHeader from "../site-header";
import SearchResults from "./search-results";
import { ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; platform?: string }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const requestedPlatformId = params.platform ? Number(params.platform) : null;
  const initialPlatformId = requestedPlatformId !== null && Number.isSafeInteger(requestedPlatformId) && requestedPlatformId > 0 ? requestedPlatformId : null;
  const user = await getCurrentUser();
  if (user) await ensureAccount(user);
  return <main className="library-page"><SiteHeader email={user?.email} query={query} platformId={initialPlatformId}/><SearchResults key={query} query={query} signedIn={Boolean(user)} initialPlatformId={initialPlatformId}/></main>;
}
