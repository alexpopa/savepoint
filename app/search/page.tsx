import { getCurrentUser } from "../auth";
import SiteHeader from "../site-header";
import SearchResults from "./search-results";
import { ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? "").trim();
  const user = await getCurrentUser();
  if (user) await ensureAccount(user);
  return <main className="library-page"><SiteHeader email={user?.email} query={query}/><SearchResults key={query} query={query} signedIn={Boolean(user)}/></main>;
}
