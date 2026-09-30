import { getDb } from "../db";
import { siteStatsQuery, type SiteStats } from "./admin-queries";

export const recentDays = 7;

export async function getSiteStats(now = Date.now()): Promise<SiteStats> {
  const stats = await getDb().$client.prepare(siteStatsQuery).bind(now - recentDays * 24 * 60 * 60 * 1000, now).first<SiteStats>();
  if (!stats) throw new Error("Site stats query returned no row.");
  return stats;
}
