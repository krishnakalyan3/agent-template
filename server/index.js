import express from "express";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    return res.status(403).json({ error: "Request origin does not match." });
  next();
});
const dbPath = resolve(process.env.DATABASE_PATH || "data/templates.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, soul TEXT NOT NULL,
  personality TEXT NOT NULL, skills TEXT NOT NULL, instructions TEXT NOT NULL, email TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`);
const passwordFile = resolve(dirname(dbPath), "admin-password.txt");
let password = process.env.ADMIN_PASSWORD;
if (!password) {
  if (!existsSync(passwordFile))
    writeFileSync(passwordFile, randomBytes(24).toString("base64url"), {
      mode: 0o600,
    });
  password = readFileSync(passwordFile, "utf8").trim();
  console.log(`Admin password stored in ${passwordFile}`);
}
const secret = randomBytes(32);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const same = (a, b) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const sign = (value) =>
  createHmac("sha256", secret).update(value).digest("hex");
const smtpReady = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.PUBLIC_URL,
);
const mailer = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
    })
  : null;
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  soul: z.string().trim().min(1).max(12000),
  personality: z.string().trim().min(1).max(12000),
  skills: z
    .array(z.string().trim().min(1).max(100))
    .max(30)
    .refine(
      (items) => new Set(items).size === items.length,
      "Skills must be unique",
    ),
  instructions: z.string().trim().max(12000).default(""),
  email: z.union([z.literal(""), z.email().max(254)]).default(""),
  sendEmail: z.boolean().default(false),
});
const limits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  for (const [key, item] of limits) if (now > item.until) limits.delete(key);
  const key = `${req.ip}:${req.path === "/api/admin/login" ? "login" : "write"}`;
  const item = limits.get(key) || { count: 0, until: now + 60000 };
  item.count++;
  limits.set(key, item);
  if (item.count > (req.path === "/api/admin/login" ? 10 : 30))
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a minute." });
  next();
}
function admin(req, res, next) {
  const cookie =
    req.headers.cookie
      ?.split("; ")
      .find((c) => c.startsWith("admin_session="))
      ?.slice(14) || "";
  const [expires, signature] = cookie.split(".");
  if (
    !expires ||
    !signature ||
    Number(expires) < Date.now() ||
    !same(sign(expires), signature)
  )
    return res.status(401).json({ error: "Please sign in to the admin view." });
  next();
}
function publicRow(row) {
  if (!row) return null;
  const { token_hash, ...rest } = row;
  return { ...rest, skills: JSON.parse(row.skills) };
}
async function emailTemplate(t, token) {
  const link = `${process.env.PUBLIC_URL.replace(/\/$/, "")}/edit/${token}`;
  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: t.email,
    subject: `Your agent template: ${t.name}`,
    text: `Your agent template is saved. Keep this private link to edit it:\n${link}\n\n# ${t.name}\n\n# Soul\n${t.soul}\n\n# Personality\n${t.personality}\n\n# Skills\n${t.skills.join("\n")}\n\n${t.instructions}`,
  });
}
app.get("/api/config", (req, res) => res.json({ emailEnabled: smtpReady }));
app.post("/api/admin/login", rateLimit, (req, res) => {
  if (
    typeof req.body.password !== "string" ||
    !same(password, req.body.password)
  )
    return res.status(401).json({ error: "Incorrect admin password." });
  const expires = String(Date.now() + 8 * 3600000);
  res.set(
    "Set-Cookie",
    `admin_session=${expires}.${sign(expires)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${process.env.PUBLIC_URL?.startsWith("https:") ? "; Secure" : ""}`,
  );
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  res.set(
    "Set-Cookie",
    "admin_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0",
  );
  res.json({ ok: true });
});
app.get("/api/admin/templates", admin, (req, res) =>
  res.json(
    db
      .prepare("SELECT * FROM templates ORDER BY updated_at DESC")
      .all()
      .map(publicRow),
  ),
);
app.get("/api/templates/:token", (req, res) => {
  const row = publicRow(
    db
      .prepare("SELECT * FROM templates WHERE token_hash = ?")
      .get(hash(req.params.token)),
  );
  if (!row)
    return res.status(404).json({ error: "This edit link was not found." });
  res.json(row);
});
async function save(req, res, update = false) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
  const t = parsed.data;
  if (t.sendEmail && (!smtpReady || !t.email))
    return res
      .status(400)
      .json({
        error:
          "Email delivery needs a configured mail server and an email address.",
      });
  const token = update
    ? req.params.token
    : randomBytes(32).toString("base64url");
  const existing = update
    ? db
        .prepare("SELECT * FROM templates WHERE token_hash = ?")
        .get(hash(token))
    : null;
  if (update && !existing)
    return res.status(404).json({ error: "This edit link was not found." });
  const id = existing?.id || randomBytes(12).toString("hex");
  const now = new Date().toISOString();
  if (update)
    db.prepare(
      "UPDATE templates SET name=?, soul=?, personality=?, skills=?, instructions=?, email=?, updated_at=? WHERE id=?",
    ).run(
      t.name,
      t.soul,
      t.personality,
      JSON.stringify(t.skills),
      t.instructions,
      t.email,
      now,
      id,
    );
  else
    db.prepare(
      "INSERT INTO templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      hash(token),
      t.name,
      t.soul,
      t.personality,
      JSON.stringify(t.skills),
      t.instructions,
      t.email,
      now,
      now,
    );
  let emailStatus = "not_requested";
  if (t.sendEmail) {
    try {
      await emailTemplate(t, token);
      emailStatus = "sent";
    } catch {
      emailStatus = "failed";
    }
  }
  res.status(update ? 200 : 201).json({ id, editToken: token, emailStatus });
}
app.post("/api/templates", rateLimit, (req, res, next) =>
  save(req, res).catch(next),
);
app.put("/api/templates/:token", rateLimit, (req, res, next) =>
  save(req, res, true).catch(next),
);
app.use(express.static(resolve("dist")));
app.get(/^(?!\/api).*/, (req, res) => {
  if (existsSync(resolve("dist/index.html")))
    res.sendFile(resolve("dist/index.html"));
  else res.status(404).send("Start the frontend with npm run dev.");
});
app.use((err, req, res, next) => {
  console.error(err.message);
  const status = [400, 413].includes(err.status) ? err.status : 500;
  res
    .status(status)
    .json({
      error:
        status === 413
          ? "Template is too large."
          : status === 400
            ? "Invalid request body."
            : "Could not process the request. Please try again.",
    });
});
app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(
    `Agent Workshop API listening on port ${process.env.PORT || 3001}`,
  ),
);
