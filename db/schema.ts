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
  // Set while this platform copy is currently playing; removing the copy removes the mark.
  playingSince: integer("playing_since"),
  // Set once this platform copy is completed; it is independent of currently playing.
  completedAt: integer("completed_at"),
}, (table) => [
  uniqueIndex("idx_library_user_game_platform").on(table.userId, table.igdbId, table.platformId),
  index("idx_library_added_at_game_user").on(table.addedAt, table.igdbId, table.userId),
  index("idx_library_game_added_at").on(table.igdbId, table.addedAt),
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
  check("ck_game_ratings_score", sql`${table.score} BETWEEN 1 AND 5`),
]);
