/** iPhone / iPad (including iPadOS that reports as Macintosh). */
export function isIosBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
}

/** bb.js WASM abort / worker crash — do not unmount the React app. */
export function isBbWasmAbort(message) {
  const text = String(message || "");
  return (
    /throw_or_abort_impl/i.test(text) ||
    /wasm-function\[/i.test(text) ||
    /main\.worker-/i.test(text) ||
    /RangeError:\s*Out of memory/i.test(text) ||
    /WebAssembly\.Memory/i.test(text) ||
    /RuntimeError[\s\S]*abort/i.test(text)
  );
}

/**
 * bb.js options for PXE prover on memory-constrained Safari.
 * threads: 1 selects the non-shared WASM build when the iOS patch is applied.
 */
export function bbProverOptionsForBrowser() {
  if (!isIosBrowser()) return {};
  return {
    threads: 1,
    srsSize: 2 ** 18,
    memory: {
      initial: 37,
      maximum: 2 ** 14,
    },
  };
}
