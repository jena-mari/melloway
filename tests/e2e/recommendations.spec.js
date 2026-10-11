import { test, expect } from "@playwright/test";
import { mockMapTiles } from "./fixtures.js";
import { interpretPreferences } from "../../src/engine/preferences.js";

test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "curated", recommendations: "openai" } }),
  );
  await page.route("**/api/intent", (route) =>
    route.fulfill({
      json: {
        intent: interpretPreferences(route.request().postDataJSON().prefs),
      },
    }),
  );
});

test("OpenAI ranking affects the generated outing while retaining Google Maps and original place facts", async ({
  page,
}) => {
  let request;
  await page.route("**/api/recommendations", (route) => {
    request = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      json: {
        rankings: request.venues.map((v) => ({
          venueId: v.id,
          fit: /Bookshop|Matcha/.test(v.name) ? 10 : 2,
          exclude: /Restaurant/.test(v.name),
        })),
      },
    });
  });
  await page.goto("/plan/notes");
  await page
    .getByLabel("anything else for ur plan?")
    .fill("matcha and books, no restaurant");
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await page.locator(".route-summary-spot").first().click();
  await expect(page.locator(".inline-stop-details").first()).toBeVisible();
  const current = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("melloway.current")),
  );
  expect(request.prefs.notes).toBe("matcha and books, no restaurant");
  expect(current.plan.recommendationSource).toBe("openai");
  expect(current.plan.cost).toBeLessThanOrEqual(current.plan.prefs.budget);
  expect(current.plan.elapsed).toBeLessThanOrEqual(
    current.plan.prefs.duration * 60,
  );
  expect(current.plan.stops.some((v) => /Restaurant/.test(v.name))).toBe(false);
  for (const stop of current.plan.stops) {
    const original = request.venues.find((v) => v.id === stop.id);
    expect(stop.name).toBe(original.name);
    expect(stop.lat).toBe(original.lat);
    expect(stop.estimatedCost).toBe(original.estimatedCost ?? original.cost);
    expect(stop.cost).toBeGreaterThanOrEqual(stop.estimatedCost);
  }
  await expect(page.locator(".map-preview")).toBeVisible();
  await expect(page.locator(".map-preview .google-map-canvas")).toHaveAttribute("data-map-state", "ready");
});

for (const failure of ["unavailable", "invalid"])
  test(`OpenAI ${failure} falls back to a usable preference-based route`, async ({
    page,
  }) => {
    await page.route("**/api/recommendations", (route) =>
      failure === "unavailable"
        ? route.fulfill({
            status: 502,
            json: { error: "External provider unavailable" },
          })
        : route.fulfill({
            json: {
              rankings: [{ venueId: "invented", fit: 10, exclude: false }],
            },
          }),
    );
    await page.goto("/plan/notes");
    await page.getByRole("button", { name: "submit", exact: true }).click();
    await expect(page).toHaveURL(/\/itinerary$/);
    await page.locator(".route-summary-spot").first().click();
    await expect(page.locator(".inline-stop-details").first()).toBeVisible();
    const current = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("melloway.current")),
    );
    expect(current.plan.recommendationSource).toBe("planner");
    expect(current.plan.notice).toContain("AI unavailable");
    expect(current.plan.stops.some((v) => v.id === "invented")).toBe(false);
  });
