import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const accounts = sqliteTable("accounts", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  passwordHash: text("password_hash"),
  emailVerifiedAt: integer("email_verified_at"),
}, (table) => [
  uniqueIndex("idx_accounts_email_login").on(table.email).where(sql`${table.passwordHash} IS NOT NULL`),
  uniqueIndex("idx_accounts_display_name_login").on(sql`lower(${table.displayName})`).where(sql`${table.passwordHash} IS NOT NULL`),
]);

// No row means a regular player. Grants are managed only through trusted D1 operations.
export const accountRoles = sqliteTable("account_roles", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin"] }).notNull(),
}, (table) => [check("ck_account_roles_role", sql`${table.role} = 'admin'`)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_sessions_user_id").on(table.userId), index("idx_sessions_expires_at").on(table.expiresAt)]);

export const loginAttempts = sqliteTable("login_attempts", {
  emailHash: text("email_hash").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: integer("window_start").notNull(),
});

export const authTokens = sqliteTable("auth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["verify", "reset"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [uniqueIndex("idx_auth_tokens_user_purpose").on(table.userId, table.purpose), index("idx_auth_tokens_expires_at").on(table.expiresAt)]);

export const friendships = sqliteTable("friendships", {
  userLow: text("user_low").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  userHigh: text("user_high").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  requesterId: text("requester_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "accepted"] }).notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userLow, table.userHigh] }),
  index("idx_friendships_user_high").on(table.userHigh),
  check("ck_friendship_pair", sql`${table.userLow} < ${table.userHigh}`),
  check("ck_friendship_requester", sql`${table.requesterId} = ${table.userLow} OR ${table.requesterId} = ${table.userHigh}`),
  check("ck_friendship_status", sql`${table.status} IN ('pending', 'accepted')`),
]);

export const libraryItems = sqliteTable("library_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  igdbId: integer("igdb_id").notNull(),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  releaseYear: integer("release_year"),
  platformsJson: text("platforms_json").notNull().default("[]"),
  platformId: integer("platform_id").notNull().default(0),
  platformName: text("platform_name"),
  addedAt: integer("added_at").notNull(),
  updatedAt: integer("updated_at"),
  // Set while this platform copy is currently playing; removing the copy removes the mark.
  playingSince: integer("playing_since"),
  // Set once this platform copy is completed; it is independent of currently playing.
  completedAt: integer("completed_at"),
  // The player's own time played; while empty, the copy shows its connected services' total instead.
  playMinutes: integer("play_minutes"),
  // The connected services' total when the player last set their own time, so only newer totals are offered.
  playSourceMinutes: integer("play_source_minutes"),
}, (table) => [
  uniqueIndex("idx_library_user_game_platform").on(table.userId, table.igdbId, table.platformId),
  index("idx_library_added_at_game_user").on(table.addedAt, table.igdbId, table.userId),
  index("idx_library_game_added_at").on(table.igdbId, table.addedAt),
  // The friends timeline reads each friend's rows newest first; partial indexes keep the mostly empty marks small.
  index("idx_library_user_updated_at").on(table.userId, table.updatedAt, table.id),
  index("idx_library_user_added_at").on(table.userId, table.addedAt),
  index("idx_library_user_playing_since").on(table.userId, table.playingSince).where(sql`${table.playingSince} IS NOT NULL`),
  index("idx_library_user_completed_at").on(table.userId, table.completedAt).where(sql`${table.completedAt} IS NOT NULL`),
]);

export const challenges = sqliteTable("challenges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipientId: text("recipient_id").notNull().references(() => accounts.userId),
  creatorId: text("creator_id").notNull().references(() => accounts.userId),
  igdbId: integer("igdb_id").notNull(),
  gameName: text("game_name").notNull(),
  gameCoverUrl: text("game_cover_url"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: integer("created_at").notNull(),
  creatorConfirmed: integer("creator_confirmed", { mode: "boolean" }).notNull().default(false),
  timelineAt: integer("timeline_at"),
  recipientConfirmed: integer("recipient_confirmed", { mode: "boolean" }).notNull().default(false),
  declinedAt: integer("declined_at"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  index("idx_challenges_recipient_game").on(table.recipientId, table.igdbId),
  index("idx_challenges_creator").on(table.creatorId),
  check("ck_challenge_other_player", sql`${table.creatorId} <> ${table.recipientId}`),
]);

export const gameFavorites = sqliteTable("game_favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  igdbId: integer("igdb_id").notNull(),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  releaseYear: integer("release_year"),
  favoritedAt: integer("favorited_at").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [uniqueIndex("idx_game_favorites_user_game").on(table.userId, table.igdbId)]);

// One score per player and game, independent of library copies like favorites.
export const gameRatings = sqliteTable("game_ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  igdbId: integer("igdb_id").notNull(),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  releaseYear: integer("release_year"),
  score: integer("score").notNull(),
  ratedAt: integer("rated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_game_ratings_user_game").on(table.userId, table.igdbId),
  index("idx_game_ratings_user_rated_at").on(table.userId, table.ratedAt),
  check("ck_game_ratings_score", sql`${table.score} BETWEEN 1 AND 5`),
]);

// One conversation per pair of players: the ordered pair mirrors friendships, and `id` orders and pages it.
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userLow: text("user_low").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  userHigh: text("user_high").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  recipientId: text("recipient_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
  // Set when the recipient reads it; the partial index keeps unread counts cheap because most rows are read.
  readAt: integer("read_at"),
}, (table) => [
  index("idx_messages_pair_id").on(table.userLow, table.userHigh, table.id),
  index("idx_messages_unread").on(table.recipientId, table.senderId).where(sql`${table.readAt} IS NULL`),
  check("ck_messages_pair", sql`${table.userLow} < ${table.userHigh}`),
  check("ck_messages_participants", sql`(${table.senderId} = ${table.userLow} AND ${table.recipientId} = ${table.userHigh}) OR (${table.senderId} = ${table.userHigh} AND ${table.recipientId} = ${table.userLow})`),
  check("ck_messages_body", sql`length(${table.body}) BETWEEN 1 AND 2000`),
]);

export const steamConnections = sqliteTable("steam_connections", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().unique(),
  steamId: text("steam_id").notNull().unique(),
  linkedAt: integer("linked_at").notNull(),
  syncedAt: integer("synced_at"),
  attemptedAt: integer("attempted_at"),
  lockToken: text("lock_token"),
  lockUntil: integer("lock_until"),
  recentJson: text("recent_json"),
  activityAt: integer("activity_at"),
  syncError: text("sync_error"),
  syncPaused: integer("sync_paused", { mode: "boolean" }).notNull().default(false),
});

export const steamLinkStates = sqliteTable("steam_link_states", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  stateHash: text("state_hash").notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

// Shared catalog cache; player choices belong to steam_games, never to this cache.
export const steamMappings = sqliteTable("steam_mappings", {
  appId: integer("app_id").primaryKey(),
  candidatesJson: text("candidates_json").notNull(),
  checkedAt: integer("checked_at").notNull(),
});

export const steamGames = sqliteTable("steam_games", {
  connectionId: text("connection_id").notNull().references(() => steamConnections.connectionId, { onDelete: "cascade" }),
  appId: integer("app_id").notNull(),
  name: text("name").notNull(),
  playtimeMinutes: integer("playtime_minutes"),
  recentMinutes: integer("recent_minutes"),
  lastPlayedAt: integer("last_played_at"),
  observedAt: integer("observed_at").notNull(),
  matchedAt: integer("matched_at"),
  gameJson: text("game_json"),
  ignored: integer("ignored", { mode: "boolean" }).notNull().default(false),
  importedAt: integer("imported_at"),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
}, (table) => [primaryKey({ columns: [table.connectionId, table.appId] }), index("idx_steam_connection_library").on(table.connectionId, table.libraryItemId, table.appId)]);

export const xboxConnections = sqliteTable("xbox_connections", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().unique(),
  xuid: text("xuid").notNull().unique(),
  gamertag: text("gamertag").notNull(),
  // AES-GCM ciphertext of the Microsoft refresh token and cached Xbox Live token; never sent to the browser.
  tokenCipher: text("token_cipher").notNull(),
  linkedAt: integer("linked_at").notNull(),
  syncedAt: integer("synced_at"),
  attemptedAt: integer("attempted_at"),
  lockToken: text("lock_token"),
  lockUntil: integer("lock_until"),
  syncError: text("sync_error"),
  syncPaused: integer("sync_paused", { mode: "boolean" }).notNull().default(false),
});

export const xboxLinkStates = sqliteTable("xbox_link_states", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  stateHash: text("state_hash").notNull(),
  verifier: text("verifier").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

// Shared catalog cache keyed by Xbox title ID; player choices belong to xbox_titles.
export const xboxMappings = sqliteTable("xbox_mappings", {
  titleId: integer("title_id").primaryKey(),
  candidatesJson: text("candidates_json").notNull(),
  checkedAt: integer("checked_at").notNull(),
});

export const xboxTitles = sqliteTable("xbox_titles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: text("connection_id").notNull().references(() => xboxConnections.connectionId, { onDelete: "cascade" }),
  titleId: integer("title_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  productId: text("product_id"),
  devicesJson: text("devices_json").notNull().default("[]"),
  lastPlayedAt: integer("last_played_at"),
  currentAchievements: integer("current_achievements").notNull().default(0),
  totalAchievements: integer("total_achievements").notNull().default(0),
  currentGamerscore: integer("current_gamerscore").notNull().default(0),
  totalGamerscore: integer("total_gamerscore").notNull().default(0),
  achievementVersion: integer("achievement_version").notNull().default(2),
  observedAt: integer("observed_at").notNull(),
  matchedAt: integer("matched_at"),
  gameJson: text("game_json"),
  importedAt: integer("imported_at"),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
  // Earned count when the achievement list was last read, so refreshes only reread titles that changed.
  achievementsSyncedCount: integer("achievements_synced_count"),
  // Time of the final unlock once every achievement is earned.
  completedAt: integer("completed_at"),
  // Xbox's MinutesPlayed stat, read on refresh for titles played since the last read.
  playMinutes: integer("play_minutes"),
}, (table) => [
  uniqueIndex("idx_xbox_titles_connection_title").on(table.connectionId, table.titleId),
  index("idx_xbox_titles_connection_library").on(table.connectionId, table.libraryItemId),
  index("idx_xbox_titles_connection_played").on(table.connectionId, table.lastPlayedAt),
  index("idx_xbox_titles_connection_completed").on(table.connectionId, table.completedAt).where(sql`${table.completedAt} IS NOT NULL`),
]);

// Shared achievement definitions, stored once per title for every player.
export const xboxAchievements = sqliteTable("xbox_achievements", {
  titleId: integer("title_id").notNull(),
  achievementId: text("achievement_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  lockedDescription: text("locked_description"),
  iconUrl: text("icon_url"),
  gamerscore: integer("gamerscore").notNull().default(0),
  isSecret: integer("is_secret", { mode: "boolean" }).notNull().default(false),
  rarity: integer("rarity"),
  sortOrder: integer("sort_order").notNull().default(0),
  checkedAt: integer("checked_at").notNull(),
}, (table) => [primaryKey({ columns: [table.titleId, table.achievementId] })]);

export const xboxUnlocks = sqliteTable("xbox_unlocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titleRowId: integer("title_row_id").notNull().references(() => xboxTitles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: integer("unlocked_at").notNull(),
}, (table) => [
  uniqueIndex("idx_xbox_unlocks_title_achievement").on(table.titleRowId, table.achievementId),
  index("idx_xbox_unlocks_user_unlocked_at").on(table.userId, table.unlockedAt),
]);

export const psnConnections = sqliteTable("psn_connections", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().unique(),
  accountId: text("account_id").notNull().unique(),
  onlineId: text("online_id").notNull(),
  // AES-GCM ciphertext of the Sony refresh token and cached access token; the NPSSO itself is never stored.
  tokenCipher: text("token_cipher").notNull(),
  linkedAt: integer("linked_at").notNull(),
  syncedAt: integer("synced_at"),
  attemptedAt: integer("attempted_at"),
  lockToken: text("lock_token"),
  lockUntil: integer("lock_until"),
  syncError: text("sync_error"),
  syncPaused: integer("sync_paused", { mode: "boolean" }).notNull().default(false),
  // Set when Sony rejects the stored sign-in; cleared by reconnecting the same PSN account.
  needsReconnect: integer("needs_reconnect", { mode: "boolean" }).notNull().default(false),
  trophyLevel: integer("trophy_level"),
  earnedPlatinum: integer("earned_platinum").notNull().default(0),
  earnedGold: integer("earned_gold").notNull().default(0),
  earnedSilver: integer("earned_silver").notNull().default(0),
  earnedBronze: integer("earned_bronze").notNull().default(0),
});

// Shared catalog cache keyed by PlayStation title key; player choices belong to psn_titles.
export const psnMappings = sqliteTable("psn_mappings", {
  titleKey: text("title_key").primaryKey(),
  candidatesJson: text("candidates_json").notNull(),
  checkedAt: integer("checked_at").notNull(),
});

// One row per merged game: the trophy list ID when there is one, otherwise the played concept.
export const psnTitles = sqliteTable("psn_titles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: text("connection_id").notNull().references(() => psnConnections.connectionId, { onDelete: "cascade" }),
  titleKey: text("title_key").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  platformsJson: text("platforms_json").notNull().default("[]"),
  npCommunicationId: text("np_communication_id"),
  npServiceName: text("np_service_name"),
  conceptId: integer("concept_id"),
  titleIdsJson: text("title_ids_json").notNull().default("[]"),
  // Whether Sony was already asked which trophy list these played title IDs belong to.
  linksChecked: integer("links_checked", { mode: "boolean" }).notNull().default(false),
  lastPlayedAt: integer("last_played_at"),
  playSeconds: integer("play_seconds"),
  earnedPlatinum: integer("earned_platinum").notNull().default(0),
  earnedGold: integer("earned_gold").notNull().default(0),
  earnedSilver: integer("earned_silver").notNull().default(0),
  earnedBronze: integer("earned_bronze").notNull().default(0),
  definedPlatinum: integer("defined_platinum").notNull().default(0),
  definedGold: integer("defined_gold").notNull().default(0),
  definedSilver: integer("defined_silver").notNull().default(0),
  definedBronze: integer("defined_bronze").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  observedAt: integer("observed_at").notNull(),
  matchedAt: integer("matched_at"),
  gameJson: text("game_json"),
  importedAt: integer("imported_at"),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
  // Earned count when the trophy list was last read, so refreshes only reread titles that changed.
  trophiesSyncedCount: integer("trophies_synced_count"),
  // Platinum time, or the final base-game trophy for lists without a platinum.
  completedAt: integer("completed_at"),
}, (table) => [
  uniqueIndex("idx_psn_titles_connection_title").on(table.connectionId, table.titleKey),
  index("idx_psn_titles_connection_library").on(table.connectionId, table.libraryItemId),
  index("idx_psn_titles_connection_played").on(table.connectionId, table.lastPlayedAt),
  index("idx_psn_titles_connection_completed").on(table.connectionId, table.completedAt).where(sql`${table.completedAt} IS NOT NULL`),
]);

// Shared trophy definitions, stored once per trophy list for every player.
export const psnTrophies = sqliteTable("psn_trophies", {
  npCommunicationId: text("np_communication_id").notNull(),
  trophyId: integer("trophy_id").notNull(),
  groupId: text("group_id").notNull().default("default"),
  name: text("name").notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  grade: text("grade").notNull(),
  isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
  rarity: integer("rarity"),
  checkedAt: integer("checked_at").notNull(),
}, (table) => [primaryKey({ columns: [table.npCommunicationId, table.trophyId] })]);

export const psnUnlocks = sqliteTable("psn_unlocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titleRowId: integer("title_row_id").notNull().references(() => psnTitles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  trophyId: integer("trophy_id").notNull(),
  earnedAt: integer("earned_at").notNull(),
}, (table) => [
  uniqueIndex("idx_psn_unlocks_title_trophy").on(table.titleRowId, table.trophyId),
  index("idx_psn_unlocks_user_earned_at").on(table.userId, table.earnedAt),
]);

// A pending RetroAchievements link: the player puts the code in their RA motto, and verifying reads it back by ULID.
export const raLinkCodes = sqliteTable("ra_link_codes", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  ulid: text("ulid").notNull(),
  username: text("username").notNull(),
  code: text("code").notNull(),
  expiresAt: integer("expires_at").notNull(),
  checkedAt: integer("checked_at"),
});

// RetroAchievements data is public and read with the site's own Web API key, so no player credential is stored.
export const raConnections = sqliteTable("ra_connections", {
  userId: text("user_id").primaryKey().references(() => accounts.userId, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().unique(),
  // RA usernames can change; the ULID cannot.
  ulid: text("ulid").notNull().unique(),
  username: text("username").notNull(),
  linkedAt: integer("linked_at").notNull(),
  syncedAt: integer("synced_at"),
  attemptedAt: integer("attempted_at"),
  lockToken: text("lock_token"),
  lockUntil: integer("lock_until"),
  syncError: text("sync_error"),
  syncPaused: integer("sync_paused", { mode: "boolean" }).notNull().default(false),
  hardcorePoints: integer("hardcore_points").notNull().default(0),
  softcorePoints: integer("softcore_points").notNull().default(0),
  retroPoints: integer("retro_points").notNull().default(0),
  beatenHardcore: integer("beaten_hardcore").notNull().default(0),
  beatenSoftcore: integer("beaten_softcore").notNull().default(0),
  mastered: integer("mastered").notNull().default(0),
  completed: integer("completed").notNull().default(0),
});

// Shared catalog cache keyed by RetroAchievements game ID; player choices belong to ra_games.
export const raMappings = sqliteTable("ra_mappings", {
  gameId: integer("game_id").primaryKey(),
  candidatesJson: text("candidates_json").notNull(),
  checkedAt: integer("checked_at").notNull(),
});

// One row per main game; its subsets fold in, like PlayStation add-on trophy groups.
export const raGames = sqliteTable("ra_games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: text("connection_id").notNull().references(() => raConnections.connectionId, { onDelete: "cascade" }),
  gameId: integer("game_id").notNull(),
  subsetIdsJson: text("subset_ids_json").notNull().default("[]"),
  name: text("name").notNull(),
  consoleId: integer("console_id").notNull(),
  consoleName: text("console_name").notNull(),
  imageUrl: text("image_url"),
  // Counts across the main set and its subsets; softcore counts include hardcore unlocks.
  earned: integer("earned").notNull().default(0),
  earnedHardcore: integer("earned_hardcore").notNull().default(0),
  total: integer("total").notNull().default(0),
  lastPlayedAt: integer("last_played_at"),
  playSeconds: integer("play_seconds"),
  observedAt: integer("observed_at").notNull(),
  matchedAt: integer("matched_at"),
  gameJson: text("game_json"),
  importedAt: integer("imported_at"),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
  // Earned plus hardcore count when the achievement lists were last read, so refreshes only reread games that changed.
  achievementsSyncedCount: integer("achievements_synced_count"),
  // First time the main game was beaten in either mode, or mastered or completed when it cannot be beaten.
  completedAt: integer("completed_at"),
  completedHardcore: integer("completed_hardcore", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  uniqueIndex("idx_ra_games_connection_game").on(table.connectionId, table.gameId),
  index("idx_ra_games_connection_library").on(table.connectionId, table.libraryItemId),
  index("idx_ra_games_connection_played").on(table.connectionId, table.lastPlayedAt),
  index("idx_ra_games_connection_completed").on(table.connectionId, table.completedAt).where(sql`${table.completedAt} IS NOT NULL`),
]);

// Shared achievement definitions. RA achievement IDs are global; `set_name` names the subset, or is null for the main set.
export const raAchievements = sqliteTable("ra_achievements", {
  achievementId: integer("achievement_id").primaryKey(),
  gameId: integer("game_id").notNull(),
  setName: text("set_name"),
  title: text("title").notNull(),
  description: text("description"),
  badgeUrl: text("badge_url"),
  points: integer("points").notNull().default(0),
  displayOrder: integer("display_order").notNull().default(0),
  rarity: integer("rarity"),
  checkedAt: integer("checked_at").notNull(),
}, (table) => [index("idx_ra_achievements_game").on(table.gameId)]);

export const raUnlocks = sqliteTable("ra_unlocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameRowId: integer("game_row_id").notNull().references(() => raGames.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  achievementId: integer("achievement_id").notNull(),
  earnedAt: integer("earned_at").notNull(),
  hardcore: integer("hardcore", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  uniqueIndex("idx_ra_unlocks_game_achievement").on(table.gameRowId, table.achievementId),
  index("idx_ra_unlocks_user_earned_at").on(table.userId, table.earnedAt),
]);
