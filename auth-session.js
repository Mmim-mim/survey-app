"use strict";

const { randomBytes, createHash, timingSafeEqual } = require("crypto");
const COOKIE = "survey_session";
const digest = value => createHash("sha256").update(value).digest("hex");

// Single-process store: all sessions expire when this process restarts.
function createAuth(pool, { production = false, now = Date.now, ttl = 8 * 60 * 60 * 1000 } = {}) {
  const sessions = new Map();
  const cookieOptions = { httpOnly: true, secure: production, sameSite: "lax", path: "/" };
  const reject = (res, status, error) => res.status(status).json({ error });
  function session(req) {
    const token = String(req.headers.cookie || "").split(";").map(p => p.trim())
      .find(p => p.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = digest(token), value = sessions.get(key);
    if (!value) return null;
    if (value.expires <= now()) { sessions.delete(key); return null; }
    return { key, ...value };
  }
  function sameOrigin(req) {
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    const origin = req.headers.origin;
    if (!origin) return true; // Non-browser clients still need session + CSRF for protected writes.
    try { return new URL(origin).host === req.headers.host && ["http:", "https:"].includes(new URL(origin).protocol); }
    catch { return false; }
  }
  function start(req, res, user) {
    const previous = session(req);
    if (previous) sessions.delete(previous.key);
    for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
    if (sessions.size >= 10000) throw new Error("Session capacity reached");
    const token = randomBytes(32).toString("hex");
    sessions.set(digest(token), { userId: user.id, csrf: randomBytes(32).toString("hex"), expires: now() + ttl });
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: ttl });
  }
  async function identify(req, res) {
    const current = session(req);
    if (!current) { reject(res, 401, "กรุณาเข้าสู่ระบบใหม่"); return false; }
    const [rows] = await pool.execute("SELECT id, username, display_name, role, dept_name FROM users WHERE id = ? LIMIT 1", [current.userId]);
    const user = rows[0];
    if (!user || !["staff", "manager", "admin"].includes(user.role)) {
      sessions.delete(current.key); reject(res, 401, "บัญชีนี้ไม่สามารถใช้งานได้ กรุณาเข้าสู่ระบบใหม่"); return false;
    }
    req.authUser = { id: user.id, username: user.username, display_name: user.display_name,
      role: user.role, dept_name: user.dept_name };
    req.authSession = current;
    return true;
  }
  function csrf(req, res) {
    const supplied = String(req.headers["x-survey-csrf"] || "");
    const expected = req.authSession.csrf;
    if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      reject(res, 403, "CSRF token ไม่ถูกต้อง กรุณาโหลดหน้าใหม่"); return false;
    }
    return true;
  }
  function requireAdmin(req, res) {
    if (!req.authUser) { reject(res, 401, "กรุณาเข้าสู่ระบบใหม่"); return false; }
    if (req.authUser.role !== "admin") { reject(res, 403, "สำหรับ admin เท่านั้น"); return false; }
    return true;
  }
  async function middleware(req, res, next) {
    try {
      // Express routes are case-insensitive and accept a trailing slash by default.
      const path = req.path.toLowerCase().replace(/\/+$/, "") || "/";
      const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (write && !sameOrigin(req)) return reject(res, 403, "ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
      if (path === "/login") return next();
      // Respondents remain anonymous. No user privileges are inferred from their payload.
      if (path === "/submissions" && req.method === "POST") return next();
      const admin = path.startsWith("/admin/") || (write && /^\/survey-(sections|question-categories|question-groups)(\/|$)/.test(path));
      const scopedRead = path === "/forms" || /^\/(dashboard|strategy-dashboard)\//.test(path);
      const publicReport = !write && /^\/(dashboard|strategy-dashboard)\//.test(path) && req.query.role === "public";
      if (!(admin || write || path === "/session" || (scopedRead && !publicReport))) return next();
      if (!await identify(req, res)) return;
      if (admin && !requireAdmin(req, res)) return;
      if (write && !csrf(req, res)) return;
      // Preserve existing owner/department rules, but use verified identity only.
      if (path === "/forms" || /^\/forms\//.test(path) || (scopedRead && !publicReport)) {
        Object.assign(req.query, { username: req.authUser.username, role: req.authUser.role, dept_name: req.authUser.dept_name || "" });
        if (write) {
          req.body ||= {};
          Object.assign(req.body, { username: req.authUser.username, role: req.authUser.role,
            created_by_username: req.authUser.username, created_by: req.authUser.display_name || req.authUser.username });
        }
      }
      next();
    } catch { reject(res, 503, "ตรวจสอบสถานะเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"); }
  }
  function install(app) {
    app.get("/api/session", (req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ user: req.authUser, csrfToken: req.authSession.csrf, expiresAt: req.authSession.expires });
    });
    app.post("/api/logout", (req, res) => {
      sessions.delete(req.authSession.key);
      res.clearCookie(COOKIE, cookieOptions);
      res.json({ ok: true });
    });
  }
  return { middleware, start, requireAdmin, install };
}
module.exports = { createAuth };
