import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { canViewProfile, confirmationParticipant, hasPermission } from "../lib/permissions.ts";

const admin = { userId: "admin", isAdmin: true };
const regular = { userId: "player", isAdmin: false };
const target = { userId: "target", isPublic: false };
const challenge = { creatorId: "creator", recipientId: "recipient" };

test("profile access requires sign-in, and admins bypass privacy independently of friendship", () => {
  assert.equal(canViewProfile(null, { ...target, isPublic: true }), false);
  for (const status of [undefined, "pending", "accepted"]) {
    assert.equal(canViewProfile(admin, target, status), true);
    assert.equal(canViewProfile(regular, target, status), status === "accepted");
  }
  assert.equal(canViewProfile(regular, { ...target, isPublic: true }), true);
  assert.equal(canViewProfile(regular, { ...target, userId: regular.userId }), true);
  assert.equal(hasPermission(admin, false), true);
  assert.equal(hasPermission(regular, false), false);
  assert.equal(hasPermission(null, true), false);
});

test("regular participants cannot confirm for someone else; admins can select either participant", () => {
  const creator = { ...regular, userId: challenge.creatorId };
  const recipient = { ...regular, userId: challenge.recipientId };
  assert.equal(confirmationParticipant(creator, challenge), "creator");
  assert.equal(confirmationParticipant(recipient, challenge), "recipient");
  assert.equal(confirmationParticipant(creator, challenge, "recipient"), null);
  assert.equal(confirmationParticipant(recipient, challenge, "creator"), null);
  assert.equal(confirmationParticipant(regular, challenge), null);
  assert.equal(confirmationParticipant(admin, challenge), "recipient");
  assert.equal(confirmationParticipant(admin, challenge, "creator"), "creator");
  assert.equal(confirmationParticipant(admin, challenge, "recipient"), "recipient");
  assert.equal(confirmationParticipant(admin, challenge, "invalid"), null);
});

const grantAccountId = "1ffaf3ac-09e4-4e76-912a-c00a3258ff8e";
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^000\d_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  return db;
}
const rolesMigration = readFileSync(new URL("../drizzle/0010_user_roles.sql", import.meta.url), "utf8");

test("migration grants only the confirmed account ID, enforces valid roles, and cascades deletion", () => {
  const db = database();
  try {
    db.prepare("INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES (?, ?, ?, ?, ?)")
      .run(grantAccountId, "alex.florin.popa@gmail.com", "BlazeCloud", "test-hash", 1);
    db.prepare("INSERT INTO accounts (user_id, email, display_name) VALUES (?, ?, ?)")
      .run("dormant", "alex.florin.popa@gmail.com", "Old account");
    db.exec(rolesMigration);
    assert.deepEqual(db.prepare("SELECT user_id, role FROM account_roles").all().map((row) => ({ ...row })), [{ user_id: grantAccountId, role: "admin" }]);
    assert.throws(() => db.prepare("INSERT INTO account_roles VALUES (?, ?)").run("dormant", "user"), /CHECK constraint/);
    assert.throws(() => db.prepare("INSERT INTO account_roles VALUES (?, ?)").run("missing", "admin"), /FOREIGN KEY constraint/);
    assert.throws(() => db.prepare("INSERT INTO account_roles VALUES (?, ?)").run(grantAccountId, "admin"), /UNIQUE constraint/);
    db.prepare("DELETE FROM accounts WHERE user_id = ?").run(grantAccountId);
    assert.equal(db.prepare("SELECT count(*) AS count FROM account_roles").get()?.count, 0);
  } finally { db.close(); }
});

test("the same email with another ID, or an unverified account, does not receive the production grant", () => {
  for (const [userId, verifiedAt] of [["replacement-account", 1], [grantAccountId, null]] as const) {
    const db = database();
    try {
      db.prepare("INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES (?, ?, ?, ?, ?)")
        .run(userId, "alex.florin.popa@gmail.com", "BlazeCloud", "test-hash", verifiedAt);
      db.exec(rolesMigration);
      assert.equal(db.prepare("SELECT count(*) AS count FROM account_roles").get()?.count, 0);
    } finally { db.close(); }
  }
});
