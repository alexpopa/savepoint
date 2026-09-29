import assert from "node:assert/strict";
import test from "node:test";
import { friendRequestEmail } from "../lib/email-messages.ts";

test("friend request email links to settings and the requester's profile", () => {
  const message = friendRequestEmail("friend@example.com", "Blaze Cloud", "https://retrogameboner.com", "/users/Blaze%20Cloud");
  assert.equal(message.to, "friend@example.com");
  assert.equal(message.subject, "Blaze Cloud sent you a friend request on RGBoner");
  assert.match(message.text, /^Blaze Cloud wants to be friends on RGBoner\./);
  assert.ok(message.text.includes("\nhttps://retrogameboner.com/settings\n"));
  assert.ok(message.text.includes("\nhttps://retrogameboner.com/users/Blaze%20Cloud\n"));
});

test("friend request email mentions only the requester's display name", () => {
  const message = friendRequestEmail("friend@example.com", "Blaze", "http://localhost:5173", "/users/Blaze");
  assert.equal(message.text.includes("@"), false);
  assert.ok(message.text.includes("http://localhost:5173/settings"));
});
