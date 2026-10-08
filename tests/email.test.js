import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "agent-workshop-mail-"));
const messages = [];
let rejectMail = false,
  child,
  base;
const smtp = createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 localhost workshop test SMTP\r\n");
  let buffer = "",
    dataMode = false;
  socket.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      if (dataMode) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end < 0) break;
        messages.push(buffer.slice(0, end));
        buffer = buffer.slice(end + 5);
        dataMode = false;
        socket.write("250 Message accepted\r\n");
      } else {
        const end = buffer.indexOf("\r\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (line.startsWith("EHLO") || line.startsWith("HELO"))
          socket.write("250-localhost\r\n250 PIPELINING\r\n");
        else if (line.startsWith("MAIL FROM"))
          socket.write(rejectMail ? "550 Sender rejected\r\n" : "250 OK\r\n");
        else if (line === "DATA") {
          dataMode = true;
          socket.write("354 End with a dot\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Goodbye\r\n");
        } else socket.write("250 OK\r\n");
      }
    }
  });
});
before(async () => {
  await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
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
      DATABASE_PATH: join(temp, "email.sqlite"),
      ADMIN_PASSWORD: "email-test-password",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtp.address().port),
      SMTP_FROM: "workshop@example.com",
      SMTP_USER: "",
      PUBLIC_URL: "https://workshop.example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Startup timeout")), 10000);
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
  });
});
after(async () => {
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
  await new Promise((resolve) => smtp.close(resolve));
  rmSync(temp, { recursive: true, force: true });
});
const template = {
  name: "Mail test agent",
  soul: "Help honestly.",
  personality: "Concise.",
  skills: ["Research"],
  instructions: "Ask first.",
  email: "attendee@example.com",
};
async function submit(sendEmail) {
  return fetch(`${base}/api/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...template, sendEmail }),
  });
}
test("SMTP settings enable delivery; email is sent only with explicit opt-in", async () => {
  assert.equal(
    (await (await fetch(`${base}/api/config`)).json()).emailEnabled,
    true,
  );
  const off = await submit(false);
  assert.equal(off.status, 201);
  assert.equal((await off.json()).emailStatus, "not_requested");
  assert.equal(messages.length, 0);
  const on = await submit(true);
  assert.equal(on.status, 201);
  const result = await on.json();
  assert.equal(result.emailStatus, "sent");
  assert.equal(messages.length, 1);
  assert.match(messages[0], /To: attendee@example.com/);
  assert.match(messages[0], /Mail test agent/);
  assert.match(messages[0], /Help honestly/);
  assert.ok(
    messages[0]
      .replace(/=\r\n/g, "")
      .includes(`https://workshop.example.com/edit/${result.editToken}`),
  );
});
test("SMTP failure is reported while keeping the submitted template editable", async () => {
  rejectMail = true;
  const res = await submit(true);
  assert.equal(res.status, 201);
  const result = await res.json();
  assert.equal(result.emailStatus, "failed");
  assert.equal(messages.length, 1);
  const stored = await (
    await fetch(`${base}/api/templates/${result.editToken}`)
  ).json();
  assert.equal(stored.name, template.name);
});
