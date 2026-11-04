import assert from "node:assert/strict";
import test from "node:test";
import {
  assertListingText,
  canonicalContent,
  canonicalListing,
  fieldFromUtf8,
} from "./catalogMeta.js";
import {
  accountHomeFlag,
  curatedHomeFlag,
  isAuthoritativePoll,
  orderAuthoritative,
  partitionCatalogWindow,
  sortPolls,
  splitAuthority,
} from "./catalogSections.js";
import { scheduleEnded } from "./pollSchedule.js";

test("content hash ignores topics and binds the title", async () => {
  const left = await fieldFromUtf8(
    canonicalContent({ title: "Tea", description: "Now", options: ["Yes", "No"] }),
  );
  const right = await fieldFromUtf8(
    canonicalContent({ title: "Coffee", description: "Now", options: ["Yes", "No"] }),
  );
  assert.notEqual(left, right);
  assert.match(left, /^0x[0-9a-f]+$/);
});

test("listing binds the contract and poll id", () => {
  const a = canonicalListing({
    contract: "0xabc",
    pollId: "1",
    title: "Tea",
    description: "",
    options: ["Yes", "No"],
    topics: ["city"],
  });
  const b = canonicalListing({
    contract: "0xdef",
    pollId: "1",
    title: "Tea",
    description: "",
    options: ["Yes", "No"],
    topics: ["city"],
  });
  assert.notEqual(a, b);
});

test("listing text rejects an empty title and a long label", () => {
  assert.throws(() => assertListingText({ title: "  ", options: ["A", "B"] }), /Title is required/);
  assert.throws(
    () => assertListingText({ title: "Ok", options: ["A".repeat(81), "B"] }),
    /80 characters/,
  );
});

test("operator polls lead the authoritative lane and marked creators join them", () => {
  const polls = [
    { id: "2", title: "User", publisher: "account", creatorAuthoritative: false },
    { id: "1", title: "Office" },
    { id: "3", title: "Marked", publisher: "account", creatorAuthoritative: true, hidden: false },
    { id: "4", title: "Hidden", publisher: "account", hidden: true },
  ];
  const split = splitAuthority(polls);
  assert.deepEqual(
    split.authoritative.map((poll) => poll.id),
    ["1", "3"],
  );
  assert.deepEqual(
    split.users.map((poll) => poll.id),
    ["2"],
  );
  assert.equal(isAuthoritativePoll(polls[0]), false);
  assert.equal(isAuthoritativePoll(polls[1]), true);
  assert.deepEqual(
    orderAuthoritative(
      [
        { id: "2", publisher: "account", creatorAuthoritative: true },
        { id: "9" },
      ],
      "id",
    ).map((poll) => poll.id),
    ["9", "2"],
  );
});

test("a creator cannot feature a poll; an explicit admin flag can", () => {
  assert.equal(curatedHomeFlag({ publisher: "account", showOnHome: true }), true);
  assert.equal(curatedHomeFlag({ publisher: "account" }), false);
  assert.equal(curatedHomeFlag({ publisher: "account", showOnHome: false }), false);
  assert.equal(curatedHomeFlag({ title: "Office" }), true);
  assert.equal(curatedHomeFlag({ title: "Office", showOnHome: false }), false);
  assert.equal(accountHomeFlag(undefined), false);
  assert.equal(accountHomeFlag({ showOnHome: true }), true);
  assert.equal(accountHomeFlag({ showOnHome: false }), false);
});

test("default order stays by id; newest and ending reorder", () => {
  const polls = [
    { id: "2", publishedAt: "2026-06-01T00:00:00.000Z", endsAt: "2026-01-02T00:00:00.000Z" },
    { id: "1", publishedAt: "2026-02-01T00:00:00.000Z", endsAt: "2026-08-01T00:00:00.000Z" },
  ];
  assert.deepEqual(
    sortPolls(polls, "id").map((poll) => poll.id),
    ["1", "2"],
  );
  assert.deepEqual(
    sortPolls(polls, "newest").map((poll) => poll.id),
    ["2", "1"],
  );
  assert.deepEqual(
    sortPolls(polls, "ending").map((poll) => poll.id),
    ["2", "1"],
  );
});

test("ended polls leave the live catalog unless the homepage still features them", () => {
  const now = Date.parse("2026-06-01T00:00:00.000Z");
  const open = { id: "1", endsAt: "2026-07-01T00:00:00.000Z", publisher: "account" };
  const ended = { id: "2", endsAt: "2026-05-01T00:00:00.000Z", publisher: "account" };
  const featured = {
    id: "3",
    endsAt: "2026-05-01T00:00:00.000Z",
    publisher: "account",
    showOnHome: true,
  };
  const hidden = { id: "4", endsAt: "2026-05-01T00:00:00.000Z", hidden: true };
  assert.equal(scheduleEnded(open, now), false);
  assert.equal(scheduleEnded(ended, now), true);
  assert.equal(scheduleEnded({ id: "5" }, now), false);
  const windowed = partitionCatalogWindow([open, ended, featured, hidden], now);
  assert.deepEqual(
    windowed.live.map((poll) => poll.id),
    ["1", "3"],
  );
  assert.deepEqual(
    windowed.ended.map((poll) => poll.id),
    ["2"],
  );
});
