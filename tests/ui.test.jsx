import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:5173",
});
for (const key of [
  "window",
  "document",
  "location",
  "history",
  "HTMLElement",
  "Node",
  "MutationObserver",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
window.scrollTo = () => {};
const { render, screen, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { App } = await import("../src/App.jsx");
const user = () => userEvent.setup({ document });
let saved,
  authenticated = false,
  copied;
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (value) => {
      copied = value;
    },
  },
});
globalThis.fetch = async (url, options = {}) => {
  const data = options.body ? JSON.parse(options.body) : null;
  const response = (value, ok = true) => ({ ok, json: async () => value });
  if (url === "/api/config") return response({ emailEnabled: false });
  if (url === "/api/templates" && options.method === "POST") {
    saved = { ...data, id: "record", updated_at: new Date().toISOString() };
    return response({
      id: "record",
      editToken: "private-token",
      emailStatus: "not_requested",
    });
  }
  if (url === "/api/templates/private-token") {
    if (options.method === "PUT") {
      saved = { ...saved, ...data };
      return response({
        id: "record",
        editToken: "private-token",
        emailStatus: "not_requested",
      });
    }
    return response(saved);
  }
  if (url.startsWith("/api/templates/"))
    return response({ error: "This edit link was not found." }, false);
  if (url === "/api/admin/login") {
    authenticated = data.password === "admin-password";
    return authenticated
      ? response({ ok: true })
      : response({ error: "Incorrect admin password." }, false);
  }
  if (url === "/api/admin/logout") {
    authenticated = false;
    return response({ ok: true });
  }
  if (url === "/api/admin/templates")
    return authenticated
      ? response(saved ? [saved] : [])
      : response({ error: "Please sign in to the admin view." }, false);
  throw new Error(`Unexpected request ${url}`);
};
afterEach(() => {
  cleanup();
  history.replaceState({}, "", "/");
  authenticated = false;
});
test("attendee selects and edits examples, adds skills, saves, and revisits their template", async () => {
  const u = user();
  render(<App />);
  const name = screen.getByLabelText("Agent name");
  assert.match(name.value, /\d{3}$/);
  await u.clear(name);
  await u.type(name, "Evidence finder");
  await u.click(screen.getByRole("button", { name: "Curious researcher" }));
  assert.match(screen.getByLabelText(/^Soul/).value, /investigate/);
  await u.clear(screen.getByLabelText(/^Soul/));
  await u.type(
    screen.getByLabelText(/^Soul/),
    "Be honest and find original sources.",
  );
  await u.click(screen.getByRole("button", { name: "Precise & practical" }));
  await u.click(screen.getByRole("button", { name: /Coding/ }));
  await u.type(
    screen.getByLabelText("Add a custom skill"),
    "Scientific papers",
  );
  await u.click(screen.getByRole("button", { name: "Add", exact: true }));
  await u.type(
    screen.getByLabelText(/Anything else/),
    "Ask one question at a time.",
  );
  assert.equal(
    screen.getByLabelText("Email me my template and edit link").disabled,
    true,
  );
  await u.click(screen.getByRole("button", { name: "Save my agent" }));
  await screen.findByRole("heading", {
    name: "Your agent is ready for the demo.",
  });
  assert.equal(saved.name, "Evidence finder");
  assert.ok(saved.skills.includes("Scientific papers"));
  assert.ok(saved.skills.includes("Coding"));
  assert.match(
    screen.getByLabelText("Private edit link").value,
    /edit\/private-token/,
  );
  await u.click(screen.getByRole("button", { name: "Edit this agent" }));
  await waitFor(() =>
    assert.equal(screen.getByLabelText("Agent name").value, "Evidence finder"),
  );
  await u.clear(screen.getByLabelText("Agent name"));
  await u.type(screen.getByLabelText("Agent name"), "Evidence finder revised");
  await u.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("heading", { name: "A fresh version. Same agent." });
  assert.equal(saved.name, "Evidence finder revised");
});
test("admin signs in, searches, compares and changes export sections, then signs out", async () => {
  history.replaceState({}, "", "/admin");
  const u = user();
  render(<App />);
  await u.type(screen.getByLabelText("Admin password"), "wrong");
  await u.click(screen.getByRole("button", { name: "Open workspace" }));
  await waitFor(() =>
    assert.match(screen.getByRole("alert").textContent, /Incorrect/),
  );
  await u.clear(screen.getByLabelText("Admin password"));
  await u.type(screen.getByLabelText("Admin password"), "admin-password");
  await u.click(screen.getByRole("button", { name: "Open workspace" }));
  await screen.findByRole("heading", { name: "Agent collection." });
  await u.type(screen.getByLabelText("Search agents"), "nonexistent");
  assert.ok(screen.getByText("No agents match this search."));
  await u.clear(screen.getByLabelText("Search agents"));
  await u.type(screen.getByLabelText("Search agents"), "Evidence");
  await u.click(screen.getByRole("button", { name: "View template" }));
  assert.match(document.querySelector("pre").textContent, /Be honest/);
  await u.click(screen.getByRole("button", { name: "Compare with example" }));
  assert.equal(document.querySelectorAll(".comparison pre").length, 2);
  await u.selectOptions(screen.getByLabelText("Export section"), "soul");
  assert.match(document.querySelector("pre").textContent, /^# Soul/);
  assert.doesNotMatch(document.querySelector("pre").textContent, /Personality/);
  await u.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByLabelText("Admin password");
});
test("invalid edit link displays an error and prevents overwriting a missing submission", async () => {
  history.replaceState({}, "", "/edit/invalid");
  render(<App />);
  await screen.findByRole("alert");
  assert.match(screen.getByRole("alert").textContent, /not found/);
  assert.equal(
    screen.getByRole("button", { name: "Save changes" }).disabled,
    true,
  );
});
