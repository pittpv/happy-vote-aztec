/**
 * Lightweight client error ingest (Phase 5.5).
 * Logs to Vercel function logs; optional Blob append when configured.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const payload = {
      at: new Date().toISOString(),
      message: String(body.message || "").slice(0, 2000),
      stack: body.stack ? String(body.stack).slice(0, 8000) : null,
      href: body.href ? String(body.href).slice(0, 500) : null,
      userAgent: body.userAgent ? String(body.userAgent).slice(0, 400) : null,
      pollId: body.pollId != null ? String(body.pollId).slice(0, 32) : null,
    };
    console.error("[client-error]", JSON.stringify(payload));
    return res.status(204).end();
  } catch (error) {
    console.error("[client-error] handler", error);
    return res.status(204).end();
  }
}
