import { test, expect } from "@playwright/test";
import { curatedVenuesForDate } from "../../src/data/sydneyVenues.js";
import { defaultDraft } from "../../src/data/preferences.js";
import { interpretPreferences } from "../../src/engine/preferences.js";
import { demoMatrix, schedule } from "../../src/utils/planner.js";
import { mockMapTiles } from "./fixtures.js";

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

async function setup(page) {
  const prefs = { ...defaultDraft(), area: "Newtown", date: "2026-10-18" };
  const catalog = curatedVenuesForDate(prefs.date);
  const google = catalog.filter((v) => v.weeklyHours).map((v) => ({
    ...v, id: `google-${v.id}`, source: "google",
  }));
  const stops = ["maeda", "uturn-vintage", "better-read"].map((id) =>
    google.find((v) => v.id === `google-sydney-${id}`));
  const plan = {
    ...schedule(stops, prefs, demoMatrix(stops, prefs.transport), [0, 1, 2]),
    prefs, id: "click-only-fixture", notice: "Offline provider fixture",
  };
  const requests = [];
  // Unmocked API requests fail locally; no real provider or credentials are used.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503,
    json: { error: "Provider disabled in fixture" } }));
  await mockMapTiles(page);
  await page.route("**/api/status", (route) => route.fulfill({
    json: { venues: "google", recommendations: "openai" },
  }));
  for (const endpoint of ["venues", "recommendations", "matrix", "intent"])
    await page.route(`**/api/${endpoint}`, (route) => {
      const body = route.request().postDataJSON();
      requests.push({ endpoint, body });
      const json = endpoint === "venues" ? { venues: google }
        : endpoint === "intent" ? { intent: interpretPreferences(body.prefs) }
        : endpoint === "matrix" ? { matrix: demoMatrix(body.venues, body.prefs.transport) }
        : { rankings: body.venues.map((v) => ({ venueId: v.id, fit: 7, exclude: false })) };
      return route.fulfill({ json });
    });
  await page.addInitScript((plan) => {
    if (!localStorage.getItem("melloway.current"))
      localStorage.setItem("melloway.current", JSON.stringify({ plan, candidates: [], matrix: [] }));
  }, plan);
  await page.goto("/itinerary");
  await expect(page.getByRole("link", { name: "explore more spots", exact: true })).toBeVisible();
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  return requests;
}
const recommendations = (requests) => requests.filter((r) => r.endpoint === "recommendations").length;
async function showSuggestions(page) {
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  await expect(page.getByRole("list", { name: "Nearby spot suggestions" })).toBeVisible();
}

test("opening and reloading ur day and Explore wait for an explicit suggestions click", async ({ page }, info) => {
  const requests = await setup(page);
  expect(requests).toEqual([]);
  await page.reload();
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  expect(requests).toEqual([]);
  await page.getByRole("link", { name: "explore more spots", exact: true }).click();
  await expect(page.getByRole("button", { name: "show suggestions", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.screenshot({ path: info.outputPath("suggestions-on-demand.png"), fullPage: true });
  await showSuggestions(page);
  expect(requests.map((r) => r.endpoint)).toEqual(["venues", "recommendations", "matrix"]);
  await page.getByRole("button", { name: "Next suggested spot", exact: true }).click();
  await page.getByLabel("search suggestions").fill("Mapo");
  await page.getByRole("button", { name: "clear search", exact: true }).click();
  expect(recommendations(requests)).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "show suggestions", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Nearby spot suggestions" })).toHaveCount(0);
  expect(recommendations(requests)).toBe(1);
  await showSuggestions(page);
  expect(recommendations(requests)).toBe(2);
});

test("route edits do not request suggestions and reuse the picker cache", async ({ page }) => {
  const requests = await setup(page);
  await page.getByRole("button", { name: "add a stop", exact: true }).click();
  await expect(page.getByLabel("search available spots")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "edit", exact: true }).click();
  await page.getByRole("button", { name: "move Uturn Newtown Vintage up", exact: true }).click();
  await expect(page.locator(".route-summary-spot strong").first()).toHaveText("Uturn Newtown Vintage");
  await page.getByRole("button", { name: "add a stop", exact: true }).click();
  await expect(page.getByLabel("search available spots")).toBeVisible();
  expect(requests.map((r) => r.endpoint)).toEqual(["venues", "recommendations", "matrix"]);
});

test("an explicit add-stop click loads options once and reopening reuses that cache", async ({ page }) => {
  const requests = await setup(page);
  await page.getByRole("button", { name: "add a stop", exact: true }).click();
  await expect(page.getByLabel("search available spots")).toBeVisible();
  expect(requests.map((r) => r.endpoint)).toEqual(["venues", "recommendations", "matrix"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "add a stop", exact: true }).click();
  await expect(page.getByLabel("search available spots")).toBeVisible();
  expect(requests.map((r) => r.endpoint)).toEqual(["venues", "recommendations", "matrix"]);
});

test("regeneration does its own planning without automatically requesting suggestions", async ({ page }) => {
  const requests = await setup(page);
  await page.getByRole("button", { name: "try another plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "try another plan", exact: true })).toBeEnabled();
  expect(recommendations(requests)).toBe(1);
  expect(requests.filter((r) => r.endpoint === "venues" && r.body.prefs.preferences.includes("Photo booths"))).toHaveLength(0);
  await page.getByRole("link", { name: "explore more spots", exact: true }).click();
  await expect(page.getByRole("button", { name: "show suggestions", exact: true })).toBeVisible();
  expect(recommendations(requests)).toBe(1);
  await showSuggestions(page);
  expect(recommendations(requests)).toBe(2);
});

test("a budget update does not automatically request suggestions", async ({ page }) => {
  const requests = await setup(page);
  await page.getByRole("button", { name: "add a stop", exact: true }).click();
  await expect(page.getByLabel("search available spots")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".route-summary-total").click();
  await page.getByLabel("drinks budget", { exact: true }).fill("20");
  await page.getByLabel("shopping budget", { exact: true }).fill("40");
  await page.getByRole("button", { name: "apply", exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("melloway.current")).plan.prefs.activityBudgets
  )).toEqual({ drinks: 20, shopping: 40 });
  expect(recommendations(requests)).toBe(1);
  await page.getByRole("link", { name: "explore more spots", exact: true }).click();
  await expect(page.getByRole("button", { name: "show suggestions", exact: true })).toBeVisible();
  expect(recommendations(requests)).toBe(1);
  await showSuggestions(page);
  expect(recommendations(requests)).toBe(2);
});
