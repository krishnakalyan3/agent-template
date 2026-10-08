import { test, expect } from "@playwright/test";
test("attendee builds, saves, downloads, edits; admin searches, compares, and exports", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build your agent." }),
  ).toBeVisible();
  const name = `Workshop ${test.info().project.name} ${Date.now()}`;
  await page.getByLabel("Agent name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Curious researcher" }).click();
  await expect(page.getByLabel("Soul", { exact: true })).toHaveValue(
    /investigate questions/,
  );
  await page
    .getByLabel("Soul", { exact: true })
    .fill("Find original evidence. Be candid about uncertainty.");
  await page.getByRole("button", { name: "Precise & practical" }).click();
  await page.getByRole("button", { name: /Coding/ }).click();
  await page.getByLabel("Add a custom skill").fill("Scientific papers");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel(/Anything else/).fill("Ask one question at a time.");
  await page.getByRole("button", { name: "Save my agent" }).click();
  await expect(
    page.getByRole("heading", { name: "Your agent is ready for the demo." }),
  ).toBeVisible();
  const link = await page.getByLabel("Private edit link").inputValue();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/agent.md$/);
  await page.goto(link);
  await expect(page.getByLabel("Agent name", { exact: true })).toHaveValue(
    name,
  );
  await page.getByLabel("Agent name", { exact: true }).fill(`${name} edited`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "A fresh version. Same agent." }),
  ).toBeVisible();
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill("wrong");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect");
  await page.getByLabel("Admin password").fill("browser-test-password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Agent collection." }),
  ).toBeVisible();
  await page.getByLabel("Search agents").fill(name);
  await page.getByRole("button", { name: "View template" }).click();
  await expect(page.locator("pre")).toContainText("Find original evidence.");
  await page.getByRole("button", { name: "Compare with example" }).click();
  await expect(page.locator(".comparison pre")).toHaveCount(2);
  await page.getByLabel("Export section").selectOption("soul");
  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await exportPromise).suggestedFilename()).toMatch(/soul.md$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  expect(errors).toEqual([]);
});
test("responsive layout, required inputs, and invalid edit link", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Agent name", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save my agent" }).click();
  expect(
    await page
      .getByLabel("Agent name", { exact: true })
      .evaluate((el) => el.validity.valueMissing),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-builder.png`,
    fullPage: true,
  });
  await page.goto("/edit/invalid-link");
  await expect(page.getByRole("alert")).toContainText("not found");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
});
