import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
const temp = mkdtempSync(join(tmpdir(), "agent-workshop-"));
let child, base, cookie, token, id;
const template = {
  name: "Test agent",
  soul: "Act honestly.",
  personality: "Clear and kind.",
  skills: ["Research"],
  instructions: "Ask first.",
  email: "",
};
async function start() {
  const port = await new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
  });
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(temp, "test.sqlite"),
      ADMIN_PASSWORD: "test-admin-password",
      SMTP_HOST: "",
      SMTP_FROM: "",
      PUBLIC_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server startup timed out")),
      10000,
    );
    child.stdout.on("data", (data) => {
      if (data.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited ${code}`));
    });
    child.stderr.on("data", () => {});
  });
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
}
function request(path, method = "GET", body, headers = {}) {
  return fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
before(start);
after(async () => {
  await stop();
  rmSync(temp, { recursive: true, force: true });
});
test("admin access requires authentication", async () => {
  assert.equal((await request("/api/admin/templates")).status, 401);
  assert.equal(
    (await request("/api/admin/login", "POST", { password: "wrong" })).status,
    401,
  );
  const res = await request("/api/admin/login", "POST", {
    password: "test-admin-password",
  });
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
  assert.match(res.headers.get("set-cookie"), /HttpOnly/);
});
test("validates input and prevents cross-origin submissions", async () => {
  assert.equal(
    (await request("/api/templates", "POST", { ...template, soul: "" })).status,
    400,
  );
  assert.equal(
    (await request("/api/templates", "POST", { ...template, email: "bad" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/templates", "POST", {
        ...template,
        skills: Array(31).fill("Research"),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/templates", "POST", template, {
        Origin: "https://other.example",
      })
    ).status,
    403,
  );
});
test("saves to SQLite, returns a private edit token, hides token from admins", async () => {
  const res = await request("/api/templates", "POST", template);
  assert.equal(res.status, 201);
  const result = await res.json();
  token = result.editToken;
  id = result.id;
  assert.ok(token.length >= 40);
  const detail = await (await request(`/api/templates/${token}`)).json();
  assert.equal(detail.name, template.name);
  assert.deepEqual(detail.skills, template.skills);
  assert.equal(detail.token_hash, undefined);
  const list = await (
    await request("/api/admin/templates", "GET", null, { Cookie: cookie })
  ).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].editToken, undefined);
  const db = new DatabaseSync(join(temp, "test.sqlite"));
  const row = db.prepare("SELECT * FROM templates").get();
  assert.notEqual(row.token_hash, token);
  assert.equal(row.id, id);
  db.close();
});
test("private links can edit, invalid links cannot read or edit", async () => {
  assert.equal((await request("/api/templates/invalid")).status, 404);
  assert.equal(
    (await request("/api/templates/invalid", "PUT", template)).status,
    404,
  );
  const res = await request(`/api/templates/${token}`, "PUT", {
    ...template,
    name: "Updated agent",
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, id);
  assert.equal(
    (await (await request(`/api/templates/${token}`)).json()).name,
    "Updated agent",
  );
});
test("email opt-in cannot be accepted when delivery is disabled", async () => {
  assert.equal(
    (await (await request("/api/config")).json()).emailEnabled,
    false,
  );
  assert.equal(
    (
      await request("/api/templates", "POST", {
        ...template,
        email: "test@example.com",
        sendEmail: true,
      })
    ).status,
    400,
  );
});
test("logout clears the cookie; forged cookies fail", async () => {
  const res = await request("/api/admin/logout", "POST");
  assert.match(res.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (
      await request("/api/admin/templates", "GET", null, {
        Cookie: "admin_session=9999999999999.forged",
      })
    ).status,
    401,
  );
});
test("templates persist after restart and old admin sessions expire", async () => {
  await stop();
  await start();
  assert.equal(
    (await (await request(`/api/templates/${token}`)).json()).name,
    "Updated agent",
  );
  assert.equal(
    (await request("/api/admin/templates", "GET", null, { Cookie: cookie }))
      .status,
    401,
  );
});
test("repeated login attempts are rate limited", async () => {
  let res;
  for (let i = 0; i < 11; i++)
    res = await request("/api/admin/login", "POST", { password: "wrong" });
  assert.equal(res.status, 429);
});
