/**
 * iOS Safari kills multithreaded bb.js (SharedArrayBuffer + several WASM workers).
 * Force the single-thread, non-shared WASM build inside Web Workers too:
 * getSharedMemoryAvailable() currently uses worker.crossOriginIsolated, which is
 * true on aztec.happyvote.xyz (COOP/COEP) and therefore enables pthreads on iPhone.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = join(
  webRoot,
  "node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/helpers/browser/index.js",
);

if (!existsSync(helperPath)) {
  throw new Error(`@aztec/bb.js browser helpers not found: ${helperPath}`);
}

const source = readFileSync(helperPath, "utf8");
if (source.includes("HappyVote iOS: disable shared WASM")) {
  console.log(`[patch-bb-ios] already patched: ${helperPath}`);
  process.exit(0);
}

const needle = `export function getSharedMemoryAvailable() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    return typeof SharedArrayBuffer !== 'undefined' && globalScope.crossOriginIsolated;
}`;

const replacement = `export function getSharedMemoryAvailable() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const nav = globalScope.navigator;
    const ua = (nav && nav.userAgent) || '';
    // HappyVote iOS: disable shared WASM (Safari aborts pthread/SAB growth).
    const ios = /iPad|iPhone|iPod/.test(ua) || (nav && nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
    if (ios) return false;
    return typeof SharedArrayBuffer !== 'undefined' && globalScope.crossOriginIsolated;
}`;

if (!source.includes(needle)) {
  throw new Error(
    `Did not find getSharedMemoryAvailable() in ${helperPath}. @aztec/bb.js may have changed; update scripts/patch-bb-ios.mjs.`,
  );
}

writeFileSync(helperPath, source.replace(needle, replacement));
console.log(`[patch-bb-ios] applied: ${helperPath}`);
