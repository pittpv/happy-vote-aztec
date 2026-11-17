import assert from "node:assert/strict";
import test from "node:test";
import { applyZkRequirementsToQuery, clampZkAgeInput, normalizeZkRequirements } from "./zkRequirements.js";

test("operator and user age limits match the passport app", () => {
  assert.equal(clampZkAgeInput("120"), "99");
  assert.equal(clampZkAgeInput("18"), "18");
  assert.equal(clampZkAgeInput(""), "");
  assert.throws(() => normalizeZkRequirements({ minAge: 100 }), /1–99/);
  assert.throws(() => normalizeZkRequirements({ maxAge: 120 }), /1–99/);
  const rules = normalizeZkRequirements({ minAge: 18, maxAge: 99, personhood: true });
  assert.equal(rules.minAge, 18);
  assert.equal(rules.maxAge, 99);
});

test("a policy id is the whole request", () => {
  const calls = [];
  const builder = {
    policy(id) {
      calls.push(["policy", id]);
      return this;
    },
    gte() {
      throw new Error("local predicate");
    },
    done() {
      return { query: { policy: calls[0][1] } };
    },
  };
  const done = applyZkRequirementsToQuery(builder, { policyId: "pol_demo", minAge: 18 });
  assert.deepEqual(calls, [["policy", "pol_demo"]]);
  assert.equal(done.query.policy, "pol_demo");
});
