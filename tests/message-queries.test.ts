import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  conversationsQuery, markReadQuery, messageFriendQuery, newerMessagesQuery, olderMessagesQuery, sendMessageQuery, unreadCountQuery,
} from "../lib/message-queries.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  db.exec(`INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES
    ('a', 'a@example.test', 'Ana', 'hash', 1), ('b', 'b@example.test', 'bo', 'hash', 1), ('c', 'c@example.test', 'Cy', 'hash', 1),
    ('d', 'd@example.test', 'Dee', 'hash', 1), ('u', 'u@example.test', 'Unverified', 'hash', NULL)`);
  db.exec(`INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES
    ('a', 'b', 'a', 'accepted', 1), ('a', 'c', 'c', 'accepted', 1), ('a', 'd', 'a', 'pending', 1), ('a', 'u', 'a', 'accepted', 1)`);
  return db;
}
const send = (db: DatabaseSync, from: string, to: string, body: string, at = 100) => db.prepare(sendMessageQuery).get(from, to, body, at);

test("messages send only between verified accepted friends", () => {
  const db = database();
  assert.deepEqual({ ...send(db, "a", "b", "hi") }, { id: 1, mine: 1, body: "hi", createdAt: 100 });
  assert.equal(send(db, "b", "a", "hey")?.mine, 1);
  assert.equal(send(db, "a", "d", "pending request"), undefined);
  assert.equal(send(db, "a", "u", "unverified friend"), undefined);
  assert.equal(send(db, "a", "a", "myself"), undefined);
  assert.equal(send(db, "c", "b", "not friends"), undefined);
  assert.ok(db.prepare(messageFriendQuery).get("a", "c"));
  assert.equal(db.prepare(messageFriendQuery).get("a", "d"), undefined);
  assert.throws(() => db.exec("INSERT INTO messages (user_low, user_high, sender_id, recipient_id, body, created_at) VALUES ('a', 'b', 'a', 'b', '', 1)"));
  assert.throws(() => db.exec("INSERT INTO messages (user_low, user_high, sender_id, recipient_id, body, created_at) VALUES ('a', 'b', 'c', 'b', 'x', 1)"));
  db.close();
});

test("threads page back by id and poll forward from the last synced id", () => {
  const db = database();
  for (let i = 1; i <= 7; i++) send(db, i % 2 ? "a" : "b", i % 2 ? "b" : "a", `m${i}`, i);
  send(db, "a", "c", "other thread");
  const older = (viewer: string, before: number, limit: number) => db.prepare(olderMessagesQuery).all(viewer, "b" === viewer ? "a" : "b", before, limit);
  assert.deepEqual(older("a", Number.MAX_SAFE_INTEGER, 3).map((row) => row.body), ["m7", "m6", "m5"]);
  assert.deepEqual(older("a", 5, 3).map((row) => row.body), ["m4", "m3", "m2"]);
  assert.deepEqual(older("b", 5, 10).map((row) => [row.body, row.mine]), [["m4", 1], ["m3", 0], ["m2", 1], ["m1", 0]]);
  assert.deepEqual(db.prepare(newerMessagesQuery).all("a", "b", 5, 100).map((row) => row.body), ["m6", "m7"]);
  assert.deepEqual(db.prepare(newerMessagesQuery).all("a", "b", 7, 100), []);
  db.close();
});

test("conversations list every friend with the latest preview and unread count, most recent first", () => {
  const db = database();
  send(db, "a", "b", "first", 1);
  send(db, "b", "a", "x".repeat(300), 2);
  send(db, "b", "a", "reply", 3);
  send(db, "c", "a", "from cy", 4);
  send(db, "a", "c", "back", 5);
  const rows = () => db.prepare(conversationsQuery).all("a").map((row) => ({ ...row }));
  assert.deepEqual(rows().map((row) => [row.displayName, row.lastBody, row.lastMine, row.unread]), [["Cy", "back", 1, 1], ["bo", "reply", 0, 2]]);
  assert.equal(db.prepare(conversationsQuery).all("b").length, 1);
  db.exec("INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES ('e', 'e@example.test', 'Eve', 'hash', 1)");
  db.exec("INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES ('a', 'e', 'a', 'accepted', 1)");
  assert.deepEqual(rows().map((row) => [row.displayName, row.lastId]), [["Cy", 5], ["bo", 3], ["Eve", null]]);
  db.exec("INSERT INTO messages (user_low, user_high, sender_id, recipient_id, body, created_at, read_at) VALUES ('a', 'e', 'e', 'a', 'old import', 0, 0)");
  assert.deepEqual(rows().map((row) => row.displayName), ["Cy", "bo", "Eve"]);
  const preview = db.prepare(conversationsQuery).all("b")[0];
  assert.equal(preview.lastBody, "reply");
  send(db, "b", "a", "y".repeat(300), 6);
  assert.equal(String(db.prepare(conversationsQuery).all("a")[0].lastBody).length, 140);
  db.close();
});

test("reading marks only loaded messages from that friend, and unread counts drop removed friends", () => {
  const db = database();
  send(db, "b", "a", "one", 1);
  send(db, "b", "a", "two", 2);
  send(db, "c", "a", "three", 3);
  send(db, "a", "b", "mine", 4);
  const unread = (viewer = "a") => db.prepare(unreadCountQuery).get(viewer)?.count;
  assert.equal(unread(), 3);
  assert.equal(unread("b"), 1);
  db.prepare(markReadQuery).run("a", "b", 50, 1);
  assert.equal(unread(), 2);
  db.prepare(markReadQuery).run("a", "b", 60, 99);
  assert.equal(unread(), 1);
  assert.equal(db.prepare("SELECT read_at FROM messages WHERE id = 1").get()?.read_at, 50);
  db.prepare(markReadQuery).run("b", "c", 70, 99);
  assert.equal(unread(), 1);
  db.exec("DELETE FROM friendships WHERE user_low = 'a' AND user_high = 'c'");
  db.prepare(markReadQuery).run("a", "c", 80, 99);
  assert.equal(db.prepare("SELECT read_at FROM messages WHERE id = 3").get()?.read_at, null);
  assert.equal(unread(), 0);
  assert.equal(db.prepare(conversationsQuery).all("a").length, 1);
  assert.equal(send(db, "a", "c", "after unfriending"), undefined);
  db.close();
});
