import assert from "node:assert/strict";
import test from "node:test";
import { canonicalContent, canonicalListing } from "./catalogMeta.js";
import {
  eligibilityModeFromAccountRules,
  normalizeAccountZkRules,
  querySatisfiesAccountRules,
} from "./zkRuleCanonical.js";

const openListing = canonicalListing({
  contract: "0xABC",
  pollId: "4",
  title: "T",
  description: "D",
  options: ["Yes", "No"],
  topics: ["community"],
});

test("an open listing keeps the previous signature payload", () => {
  assert.equal(
    openListing,
    '{"contract":"0xabc","description":"D","options":["Yes","No"],"pollId":"4","title":"T","topics":["community"]}',
  );
  assert.equal(
    canonicalContent({ title: "T", description: "D", options: ["Yes", "No"] }),
    '{"description":"D","options":["Yes","No"],"title":"T"}',
  );
});

test("gated rules change the signed payload and reject a weaker query", () => {
  const rules = normalizeAccountZkRules({
    minAge: "18",
    nationalityIn: ["USA", "GBR"],
    sanctions: true,
    purpose: "Members only",
  });
  assert.equal(eligibilityModeFromAccountRules(rules), 2);
  const signed = canonicalContent({ title: "T", description: "D", options: ["Yes", "No"], zk: rules });
  assert.match(signed, /"minAge":18/);
  assert.notEqual(signed, canonicalContent({ title: "T", description: "D", options: ["Yes", "No"] }));

  querySatisfiesAccountRules(
    {
      age: { gte: 21 },
      nationality: { in: ["USA"] },
      sanctions: { countries: "all", lists: "all", strict: false },
    },
    rules,
  );
  assert.throws(
    () => querySatisfiesAccountRules({ age: { gte: 17 }, nationality: { in: ["USA"] }, sanctions: true }, rules),
    /Age check/,
  );
  assert.throws(
    () => querySatisfiesAccountRules({ age: { gte: 18 }, nationality: { in: ["USA", "FRA"] }, sanctions: true }, rules),
    /Nationality/,
  );
  assert.throws(
    () => querySatisfiesAccountRules({ age: { gte: 18 }, nationality: { in: ["USA"] } }, rules),
    /Sanctions/,
  );
});

test("a user poll cannot carry a Dashboard policy id", () => {
  assert.throws(() => normalizeAccountZkRules({ policyId: "pol_demo" }), /Dashboard policy id/);
});
