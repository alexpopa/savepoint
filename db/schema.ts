import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const libraryItems = sqliteTable("library_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  igdbId: integer("igdb_id").notNull(),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  releaseYear: integer("release_year"),
  platformsJson: text("platforms_json").notNull().default("[]"),
  addedAt: integer("added_at").notNull(),
}, (table) => [uniqueIndex("idx_library_user_game").on(table.userId, table.igdbId)]);
