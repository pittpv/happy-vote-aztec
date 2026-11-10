import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import seed from "../data/polls-catalog.json" with { type: "json" };
import { ogKicker } from "./og.js";
import { documentPage } from "./static-route.js";
import { applyHtmlSeo } from "../src/lib/seo.js";
import { resolvePageSeo } from "../src/lib/resolvePageSeo.js";

const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const catalog = { polls: seed.polls };

function one(html, pattern) {
  const found = html.match(pattern);
  assert.ok(found, String(pattern));
  return found[1];
}

function headOf(path) {
  const seo = resolvePageSeo(path, catalog);
  assert.ok(seo, path);
  const html = applyHtmlSeo(shell, seo);
  return {
    title: one(html, /<title>([^<]*)<\/title>/),
    description: one(html, /<meta\s+name="description"\s+content="([^"]*)"/),
    canonical: one(html, /<link\s+rel="canonical"\s+href="([^"]*)"/),
    ogTitle: one(html, /<meta\s+property="og:title"\s+content="([^"]*)"/),
    ogDescription: one(html, /<meta\s+property="og:description"\s+content="([^"]*)"/),
    ogUrl: one(html, /<meta\s+property="og:url"\s+content="([^"]*)"/),
    ogImage: one(html, /<meta\s+property="og:image"\s+content="([^"]*)"/),
    twitterTitle: one(html, /<meta\s+name="twitter:title"\s+content="([^"]*)"/),
    twitterDescription: one(html, /<meta\s+name="twitter:description"\s+content="([^"]*)"/),
    twitterImage: one(html, /<meta\s+name="twitter:image"\s+content="([^"]*)"/),
    robots: one(html, /<meta\s+name="robots"\s+content="([^"]*)"/),
    descriptionCount: html.match(/name="description"/g).length,
  };
}

test("each public page has its own title, description, canonical, and share card", () => {
  const paths = [
    "/",
    "/polls",
    "/create",
    "/faq",
    "/legal/terms",
    "/legal/privacy",
    "/legal/cookies",
    "/legal/data-safety",
    "/legal/gdpr",
    "/p/1",
    "/p/2",
    "/p/3",
    "/p/4",
  ];
  const heads = paths.map(headOf);
  for (const key of ["title", "description", "canonical", "ogUrl", "ogImage", "twitterImage"]) {
    const values = heads.map((head) => head[key]);
    assert.equal(new Set(values).size, values.length, key);
  }
  for (const head of heads) {
    assert.equal(head.descriptionCount, 1);
    assert.equal(head.ogTitle, head.title);
    assert.equal(head.twitterTitle, head.title);
    assert.equal(head.ogDescription, head.description);
    assert.equal(head.twitterDescription, head.description);
    assert.equal(head.ogUrl, head.canonical);
    assert.equal(head.twitterImage, head.ogImage);
    assert.equal(head.robots, "index, follow");
  }
  assert.equal(ogKicker("/"), "HappyVote on Aztec");
  assert.equal(ogKicker("/polls"), "All polls");
  assert.equal(ogKicker("/create"), "Create");
  assert.notEqual(ogKicker("/create"), ogKicker("/"));
});

test("create and the catalog are served with their own head, not the homepage shell", () => {
  assert.equal(documentPage("/"), "/");
  assert.equal(documentPage("/polls"), "/polls");
  assert.equal(documentPage("/create"), "/create");
  assert.equal(documentPage("/faq"), "/faq");
  assert.equal(documentPage("/p/2"), "/p/2");
  assert.equal(documentPage("/legal/privacy"), "/legal/privacy");
  const home = headOf("/");
  const polls = headOf("/polls");
  const create = headOf("/create");
  assert.notEqual(polls.description, home.description);
  assert.notEqual(create.description, home.description);
  assert.notEqual(create.canonical, home.canonical);
  assert.match(create.canonical, /\/create$/);
  assert.match(polls.ogImage, /path=%2Fpolls$/);
  assert.match(create.ogImage, /path=%2Fcreate$/);
  const admin = headOf("/admin");
  assert.equal(admin.robots, "noindex, nofollow");
  assert.notEqual(admin.canonical, home.canonical);
  assert.notEqual(admin.title, home.title);
});
