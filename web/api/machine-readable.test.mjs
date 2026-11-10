import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { expectsStaticFile } from "./static-route.js";

const llms = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
const ard = JSON.parse(readFileSync(new URL("../public/.well-known/ard.json", import.meta.url), "utf8"));

test("llms.txt matches the Lighthouse checks and stays on public pages", () => {
  assert.match(llms, /^\s*#\s+.+/m);
  assert.match(llms, /\[.+\]\(.+\)/);
  assert.ok(llms.length >= 50);
  assert.match(llms, /\[All polls\]\(https:\/\/aztec\.happyvote\.xyz\/polls\)/);
  assert.match(llms, /\[Sitemap\]\(https:\/\/aztec\.happyvote\.xyz\/sitemap\.xml\)/);
  assert.doesNotMatch(llms, /\/admin|SECRET|SIGNING_KEY|POLLS_PUBLISH|zk\.money|zkmoney|wallet-iframe/i);
});

test("ard.json publishes no agent endpoint", () => {
  assert.deepEqual(ard, { entries: [] });
});

test("file-shaped paths do not fall through to the app shell", () => {
  assert.equal(expectsStaticFile("/llms.txt"), true);
  assert.equal(expectsStaticFile("/.well-known/ard.json"), true);
  assert.equal(expectsStaticFile("/.well-known/ai-catalog.json"), true);
  assert.equal(expectsStaticFile("/favicon.svg"), true);
  assert.equal(expectsStaticFile("/"), false);
  assert.equal(expectsStaticFile("/polls"), false);
  assert.equal(expectsStaticFile("/create"), false);
  assert.equal(expectsStaticFile("/p/4"), false);
  assert.equal(expectsStaticFile("/legal/privacy"), false);
});
