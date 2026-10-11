import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import { createHack48Handler, createHack48Store } from "../../server/hack48.js";
import { hack48Path } from "../../src/data/hack48.js";
import { mockMapTiles } from "./fixtures.js";

const code = "mock_organiser_edit_code";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
async function backend(context) {
  const directory = await mkdtemp(join(tmpdir(), "melloway-mock-event-browser-"));
  const server = http.createServer(createHack48Handler({ store: createHack48Store({ directory, editCode: code }) }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await context.route("**/api/shared-events/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const response = await route.fetch({ url: `http://127.0.0.1:${server.address().port}${path}` });
    await route.fulfill({ response });
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, async close() {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true });
  } };
}
async function offline(page) {
  await mockMapTiles(page);
  await page.route("**/api/status", route => route.fulfill({ json: { venues: "curated", recommendations: "planner", socialDiscovery: "unavailable" } }));
  await page.route("**/api/events?**", route => route.fulfill({ status: 503, json: {} }));
  await page.route("https://www.instagram.com/**", route => route.fulfill({ contentType: "text/html", body: "<p>MOCK Instagram preview; no external request.</p>" }));
  // Page-level mocks run before context routes; allow this temporary shared server.
  await page.unroute("**/api/shared-events/**");
}

test("Hack48 images and Reels persist and appear in an independent browser without local event storage", async ({ page, context, browser }, info) => {
  const api = await backend(context);
  const unrelatedRequests = [];
  page.on("request", request => { if (/\/api\/(events\?|social\/events)/.test(request.url())) unrelatedRequests.push(request.url()); });
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await offline(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events?event=hack48-2026");
    const event = page.getByRole("region", { name: "Shared Hack48 event" });
    await expect(event).toContainText("33 Moses Way, Winston Hills NSW 2153");
    await expect(event).toContainText("10–12 Oct 2026");
    await expect(event).toContainText("Price unavailable");
    await event.getByText("add images or a Reel", { exact: true }).click();
    await event.getByLabel("organiser edit code").fill(code);
    await event.getByLabel(/upload an image/).setInputFiles({ name: "mock.png", mimeType: "image/png", buffer: png });
    await expect(event.getByRole("status")).toHaveText("Added to the shared event.");
    await expect(event.getByAltText("Image shared for Hack48")).toBeVisible();
    await expect.poll(() => event.getByAltText("Image shared for Hack48").evaluate(image => image.naturalWidth)).toBe(1);
    const url = "https://www.instagram.com/reel/MockHack48Reel/";
    await event.getByLabel("Instagram Reel link").fill(url + "?igsh=mock");
    await event.getByRole("button", { name: "add Reel", exact: true }).click();
    await expect(event.getByRole("link", { name: "open original Instagram Reel" })).toHaveAttribute("href", url);
    await page.reload();
    await expect(event.getByAltText("Image shared for Hack48")).toBeVisible();
    await expect(event.getByRole("link", { name: "open original Instagram Reel" })).toHaveAttribute("href", url);
    await expect(event.getByLabel("organiser edit code")).toHaveValue("");
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => /hack48|shared.event/i.test(key)))).toBe(false);
    const otherPage = await other.newPage();
    await offline(otherPage);
    await other.route("**/api/shared-events/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const response = await route.fetch({ url: api.origin + path });
      await route.fulfill({ response });
    });
    await otherPage.goto(page.url());
    const sharedEvent = otherPage.getByRole("region", { name: "Shared Hack48 event" });
    await expect(sharedEvent.getByAltText("Image shared for Hack48")).toBeVisible();
    await expect(sharedEvent.getByRole("link", { name: "open original Instagram Reel" })).toHaveAttribute("href", url);
    await sharedEvent.getByText("add images or a Reel", { exact: true }).click();
    await expect(sharedEvent.getByLabel("organiser edit code")).toHaveValue("");
    await expect(sharedEvent.getByLabel(/upload an image/)).toBeDisabled();
    expect(await otherPage.evaluate(() => Object.keys(localStorage).some(key => /hack48|shared.event/i.test(key)))).toBe(false);
    await page.screenshot({ path: info.outputPath("hack48-shared-event.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(unrelatedRequests).toEqual([]);
  } finally { await other.close(); await api.close(); }
});

test("invalid Reel links, duplicate Reels, wrong edit codes and storage failures show useful errors", async ({ page, context }) => {
  const api = await backend(context);
  try {
    await offline(page);
    await page.goto("/events?event=hack48-2026");
    const event = page.getByRole("region", { name: "Shared Hack48 event" });
    await event.getByText("add images or a Reel", { exact: true }).click();
    await event.getByLabel("organiser edit code").fill(code);
    await event.getByLabel("Instagram Reel link").fill("https://www.instagram.com/p/MockPost/");
    await event.getByRole("button", { name: "add Reel", exact: true }).click();
    await expect(event.getByRole("alert")).toContainText("full Instagram Reel");
    await event.getByLabel("Instagram Reel link").fill("https://www.instagram.com/reel/MockDuplicate/");
    await event.getByRole("button", { name: "add Reel", exact: true }).click();
    await expect(event.getByRole("status")).toContainText("Added");
    await event.getByLabel("Instagram Reel link").fill("https://www.instagram.com/reel/MockDuplicate/?igsh=mock");
    await event.getByRole("button", { name: "add Reel", exact: true }).click();
    await expect(event.getByRole("alert")).toContainText("already attached");
    await event.getByLabel("organiser edit code").fill("mock_wrong");
    await event.getByLabel("Instagram Reel link").fill("https://www.instagram.com/reel/MockOther/");
    await event.getByRole("button", { name: "add Reel", exact: true }).click();
    await expect(event.getByRole("alert")).toContainText("organiser edit code");
    await page.route("**/api/shared-events/**", route => route.fulfill({ status: 503, json: { error: "Mock shared storage unavailable" } }));
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Mock shared storage unavailable" })).toBeVisible();
  } finally { await api.close(); }
});
