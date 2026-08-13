import "./polyfills.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { reportClientError } from "./lib/polls.js";
import { isBbWasmAbort } from "./lib/browser.js";

function showBootError(message) {
  const root = document.getElementById("root");
  if (!root) return;
  const pre = document.createElement("pre");
  pre.style.cssText =
    "padding:1.5rem;color:#f87171;font-family:monospace;white-space:pre-wrap";
  pre.textContent = String(message);
  root.replaceChildren(pre);
}

window.addEventListener("error", (event) => {
  const message = event.error?.stack || event.message || "Unknown error";
  reportClientError({ message, stack: event.error?.stack });
  // bb.js worker aborts on iOS must not replace the whole app with a raw stack.
  if (isBbWasmAbort(message) || isBbWasmAbort(event.filename)) {
    event.preventDefault();
    return;
  }
  showBootError(message);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason?.stack || reason?.message || String(reason);
  reportClientError({ message, stack: reason?.stack });
  if (isBbWasmAbort(message)) {
    event.preventDefault();
    return;
  }
  showBootError(message);
});

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root element");
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  reportClientError({ message: error?.message || String(error), stack: error?.stack });
  showBootError(error?.stack || error?.message || String(error));
}
