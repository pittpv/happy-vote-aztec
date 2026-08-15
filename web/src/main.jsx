import "./polyfills.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { reportClientError } from "./lib/polls.js";
import { isBbWasmAbort } from "./lib/browser.js";
import { explainError } from "./lib/userMessages.js";

function showBootError(error) {
  const root = document.getElementById("root");
  if (!root) return;
  const explained = explainError(error, "generic");
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText =
    "margin:1.25rem auto;max-width:36rem;padding:0.95rem 1rem;border:1px solid rgba(232,106,92,0.5);border-radius:4px;background:rgba(232,106,92,0.12);color:#e8dcd4;font-family:system-ui,sans-serif;overflow-wrap:anywhere;word-break:break-word";
  const title = document.createElement("p");
  title.style.cssText = "margin:0 0 0.35rem;font-weight:600;color:#f0a097";
  title.textContent = explained.title;
  const body = document.createElement("p");
  body.style.cssText = "margin:0;font-size:0.9rem;line-height:1.45;color:#c9b8ae";
  body.textContent = explained.text;
  box.append(title, body);
  root.replaceChildren(box);
}

window.addEventListener("error", (event) => {
  const message = event.error?.stack || event.message || "Unknown error";
  reportClientError({ message, stack: event.error?.stack });
  // bb.js worker aborts on iOS must not replace the whole app with a raw stack.
  if (isBbWasmAbort(message) || isBbWasmAbort(event.filename)) {
    event.preventDefault();
    return;
  }
  showBootError(event.error || message);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason?.stack || reason?.message || String(reason);
  reportClientError({ message, stack: reason?.stack });
  if (isBbWasmAbort(message)) {
    event.preventDefault();
    return;
  }
  showBootError(reason || message);
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
  showBootError(error);
}
