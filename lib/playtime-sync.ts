import { getDb } from "../db";
import { playtimeOfferCount, acceptPlaytimeOffers, type PlaytimeService } from "./playtime-queries";

// Library copies a service added whose own time played is older than that service's newer total.
export async function countPlaytimeOffers(userId: string, service: PlaytimeService) {
  return (await getDb().$client.prepare(playtimeOfferCount(service)).bind(userId).first<{ total: number }>())?.total ?? 0;
}

// Use all: those copies follow the services' total again, like clearing their own time.
export async function applyPlaytimeOffers(userId: string, service: PlaytimeService) {
  await getDb().$client.prepare(acceptPlaytimeOffers(service)).bind(userId).run();
}
