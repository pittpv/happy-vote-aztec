/**
 * Long-running host for the site API and the built web app.
 * Security headers are set in this file.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 4188);
const host = process.env.HOST || "0.0.0.0";

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob: https://demo-wallet.aztec-labs.com; frame-src 'self' blob: https://demo-wallet.aztec-labs.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.zkpassport.id https://zkpassport.id; connect-src 'self' blob: data: https://aztec-testnet.drpc.org https://aztec-mainnet.drpc.org https://*.aztec-labs.com https://crs.aztec-cdn.foundation https://*.aztec-cdn.foundation https://demo-wallet.aztec-labs.com https://fonts.googleapis.com https://fonts.gstatic.com https://*.zkpassport.id https://zkpassport.id wss://bridge.zkpassport.id wss://*.zkpassport.id https://eth-sepolia.g.alchemy.com https://eth-mainnet.g.alchemy.com https://base-mainnet.g.alchemy.com; object-src 'none'",
  "Permissions-Policy":
    'camera=(), microphone=(), geolocation=(), storage-access=(self "https://demo-wallet.aztec-labs.com")',
};

const HANDLERS = {
  "/api/polls": "./api/polls.js",
  "/api/poll-state": "./api/poll-state.js",
  "/api/zkpassport-verify": "./api/zkpassport-verify.js",
  "/api/document": "./api/document.js",
  "/api/og": "./api/og.js",
  "/api/client-error": "./api/client-error.js",
  "/api/site-stats": "./api/site-stats.js",
  "/api/earlier-networks": "./api/earlier-networks.js",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".wasm": "application/wasm",
};

function createRes(nodeRes) {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      nodeRes.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
      return this;
    },
    getHeader(name) {
      return nodeRes.getHeader(name);
    },
    json(body) {
      nodeRes.statusCode = statusCode;
      if (!nodeRes.getHeader("Content-Type")) {
        nodeRes.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      nodeRes.end(JSON.stringify(body));
      return this;
    },
    send(body) {
      nodeRes.statusCode = statusCode;
      if (body == null) nodeRes.end();
      else nodeRes.end(body);
      return this;
    },
    end(body) {
      nodeRes.statusCode = statusCode;
      if (body == null) nodeRes.end();
      else nodeRes.end(body);
      return this;
    },
  };
}

function applySecurity(req, nodeRes) {
  for (const [key, value] of Object.entries(SECURITY)) nodeRes.setHeader(key, value);
  const ua = String(req.headers["user-agent"] || "");
  if (/iphone|ipod|ipad/i.test(ua)) {
    nodeRes.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  }
}

function bodyLimit(pathname) {
  if (pathname === "/api/zkpassport-verify") return 8 * 1024 * 1024;
  return 256 * 1024;
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks);
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    const text = raw.toString("utf8").trim();
    if (!text) return {};
    return JSON.parse(text);
  }
  return raw.toString("utf8");
}

function safeDistFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = decoded.replace(/^\/+/, "");
  if (!rel) return null;
  const full = normalize(join(dist, rel));
  const rootPrefix = normalize(dist + sep);
  if (full !== normalize(dist) && !full.startsWith(rootPrefix)) return null;
  return full;
}

async function fileExists(file) {
  try {
    const info = await stat(file);
    return info.isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function documentTarget(pathname) {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/" || trimmed === "/polls" || trimmed === "/faq") return trimmed;
  if (/^\/p\/[^/]+$/.test(trimmed)) return trimmed;
  if (/^\/legal\/[^/]+$/.test(trimmed)) return trimmed;
  return null;
}

function sendFile(nodeRes, file) {
  const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
  nodeRes.statusCode = 200;
  nodeRes.setHeader("Content-Type", type);
  if (file.includes(`${sep}assets${sep}`)) {
    nodeRes.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
  createReadStream(file).pipe(nodeRes);
}

async function dispatchApi(req, res, pathname, search) {
  const specifier = HANDLERS[pathname];
  if (!specifier) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const loaded = await import(specifier);
  const handler = loaded.default;
  if (typeof handler !== "function") {
    throw new Error(`${pathname} has no default handler`);
  }
  req.url = pathname + search;
  await handler(req, res);
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  applySecurity(nodeReq, nodeRes);
  const res = createRes(nodeRes);
  const url = new URL(nodeReq.url || "/", "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (pathname === "/api/health") {
      res.status(200).json({ ok: true });
      return;
    }
    if (pathname.startsWith("/api/")) {
      try {
        nodeReq.body = await readBody(nodeReq, bodyLimit(pathname));
      } catch (error) {
        const status = error?.status === 413 ? 413 : 400;
        res.status(status).json({ error: status === 413 ? "Body too large" : "Invalid JSON body" });
        return;
      }
      await dispatchApi(nodeReq, res, pathname, url.search);
      return;
    }
    const page = documentTarget(pathname === "/" ? "/" : pathname);
    if (page) {
      nodeReq.body = undefined;
      nodeReq.url = `/api/document?path=${encodeURIComponent(page)}`;
      await dispatchApi(nodeReq, res, "/api/document", `?path=${encodeURIComponent(page)}`);
      return;
    }
    const file = safeDistFile(pathname);
    if (file && (await fileExists(file))) {
      sendFile(nodeRes, file);
      return;
    }
    const indexFile = join(dist, "index.html");
    if (await fileExists(indexFile)) {
      sendFile(nodeRes, indexFile);
      return;
    }
    res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error(pathname, error);
    if (!nodeRes.headersSent) {
      res.status(500).json({ error: "Request failed" });
    } else {
      nodeRes.destroy();
    }
  }
});

server.requestTimeout = 120_000;
server.headersTimeout = 130_000;
server.listen(port, host, () => {
  console.log(`HappyVote listening on ${host}:${port}`);
});
