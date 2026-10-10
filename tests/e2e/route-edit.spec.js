import { test, expect } from "@playwright/test";
import { communityExamples } from "../../src/data/community.js";
import { mockMapTiles } from "./fixtures.js";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  const plan = communityExamples()[0].plan;
  await page.addInitScript((plan) => {
    if (!localStorage.getItem("melloway.current"))
      localStorage.setItem(
        "melloway.current",
        JSON.stringify({ plan, candidates: [], matrix: [] }),
      );
  }, plan);
});
const storedPlan = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );

test("editable summary updates order, totals, map and directions; extras stay opt-in and persist", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/itinerary");
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  const initial = await storedPlan(page);
  await expect(
    page.getByRole("button", {
      name: "add Sample photobooth to route",
      exact: true,
    }),
  ).toBeEnabled();
  expect((await storedPlan(page)).stops.map((s) => s.id)).toEqual(
    initial.stops.map((s) => s.id),
  );
  await page.getByRole("button", { name: "edit", exact: true }).tap();
  await page
    .getByRole("button", {
      name: `move ${initial.stops[1].name} up`,
      exact: true,
    })
    .tap();
  await expect
    .poll(async () => (await storedPlan(page)).stops[0].id)
    .toBe(initial.stops[1].id);
  const moved = await storedPlan(page);
  expect(moved.stops.map((s) => s.id)).toEqual([
    initial.stops[1].id,
    initial.stops[0].id,
    initial.stops[2].id,
  ]);
  expect(moved.stops[0].travelFromPrevious).toBeNull();
  await page
    .getByRole("button", {
      name: `remove ${initial.stops[2].name} from route`,
      exact: true,
    })
    .tap();
  await expect(page.locator(".route-summary-list li")).toHaveCount(2);
  await expect(page.locator(".stop-card")).toHaveCount(2);
  const removed = await storedPlan(page);
  expect(removed.cost).toBe(moved.cost - initial.stops[2].cost);
  await page.getByRole("button", { name: "done", exact: true }).tap();
  await page
    .getByRole("button", {
      name: "add Sample photobooth to route",
      exact: true,
    })
    .tap();
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  await expect(page.locator(".stop-card")).toHaveCount(3);
  const added = await storedPlan(page);
  expect(added.cost).toBe(removed.cost + 12);
  expect(
    added.stops.filter((s) => s.category !== "Photo booths").map((s) => s.id),
  ).toEqual(removed.stops.map((s) => s.id));
  expect(added.elapsed).toBeLessThanOrEqual(added.prefs.duration * 60);
  await expect(page.locator(".route-summary-total")).toContainText(
    `~$${added.cost} each`,
  );
  await page.getByRole("button", { name: "stop order", exact: true }).tap();
  await expect(page.locator("#map-stop-legend li")).toHaveCount(3);
  await expect(page.locator("#map-stop-legend li").last()).toContainText(
    added.stops[2].name,
  );
  const href = await page
    .getByRole("link", { name: "open Google Maps", exact: true })
    .getAttribute("href");
  const directions = new URL(href);
  expect(directions.searchParams.get("origin")).toBe(
    `${added.stops[0].lat},${added.stops[0].lng}`,
  );
  expect(directions.searchParams.get("waypoints")).toBe(
    `${added.stops[1].lat},${added.stops[1].lng}`,
  );
  await page.getByRole("button", { name: "stop order", exact: true }).tap();
  await page.getByRole("button", { name: "lock this in", exact: true }).tap();
  await page.reload();
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  expect((await storedPlan(page)).stops.map((s) => s.id)).toEqual(
    added.stops.map((s) => s.id),
  );
  await page.getByRole("button", { name: "edit", exact: true }).tap();
  for (const stop of added.stops.slice(1))
    await page
      .getByRole("button", {
        name: `remove ${stop.name} from route`,
        exact: true,
      })
      .tap();
  await expect(page.locator(".route-summary-list li")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: `remove ${added.stops[0].name} from route`,
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".route-summary-list li")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "open Google Maps", exact: true }),
  ).toHaveAttribute("href", /maps\/search\//);
  await page.getByRole("button", { name: "lock this in", exact: true }).tap();
  await page.goto("/favourites");
  await page
    .locator(".collection-card")
    .filter({ hasText: "1 stops" })
    .getByRole("button", { name: "open plan", exact: true })
    .tap();
  await expect(page.locator(".route-summary-list li")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("single-stop-summary.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("changing a specific stop uses the searchable picker and spot details open as a bottom sheet", async ({
  page,
}, info) => {
  await page.goto("/itinerary");
  const before = await storedPlan(page);
  await page.getByRole("button", { name: "edit", exact: true }).tap();
  await page
    .getByRole("button", { name: "change spot", exact: true })
    .nth(1)
    .tap();
  const picker = page.getByRole("dialog", { name: "pick another spot." });
  await expect(picker).toBeVisible();
  await picker.getByLabel("search available spots").fill("photobooth");
  await page.screenshot({ path: info.outputPath("stop-picker-390.png") });
  await picker
    .getByRole("button", { name: "choose Sample photobooth", exact: true })
    .tap();
  await expect(picker).not.toBeVisible();
  await expect
    .poll(async () => (await storedPlan(page)).stops[1].name)
    .toBe("Sample photobooth");
  const after = await storedPlan(page);
  expect(after.stops[0].id).toBe(before.stops[0].id);
  expect(after.stops[2].id).toBe(before.stops[2].id);
  await page.getByRole("button", { name: "done", exact: true }).tap();
  const spot = page.getByRole("button", {
    name: "view Sample photobooth details",
    exact: true,
  });
  await spot.tap();
  const details = page.getByRole("dialog", {
    name: "Sample photobooth",
    exact: true,
  });
  await expect(details).toBeVisible();
  await expect(details).toContainText("15 min visit");
  await expect(details).toContainText("not a verified business");
  const box = await details.boundingBox();
  expect(box.y + box.height).toBeCloseTo(844, 0);
  await page.screenshot({ path: info.outputPath("spot-detail-sheet-390.png") });
  await page.keyboard.press("Escape");
  await expect(details).not.toBeVisible();
  await expect(spot).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "edit", exact: true }).tap();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("editable-route-320.png"),
    fullPage: true,
  });
});

test("extras beyond the remaining budget cannot change the route", async ({
  page,
}) => {
  await page.goto("/itinerary");
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("melloway.current"));
    current.plan.prefs.budget = current.plan.cost;
    localStorage.setItem("melloway.current", JSON.stringify(current));
  });
  await page.reload();
  const before = await storedPlan(page);
  await expect(page.locator(".route-extras")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(
    page.getByRole("button", {
      name: "add Sample photobooth to route",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "add a stop", exact: true }).tap();
  await page.getByLabel("search available spots").fill("photo");
  await expect(
    page.getByRole("button", { name: "add Sample photobooth", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect((await storedPlan(page)).stops).toEqual(before.stops);
  await expect(page.locator(".route-summary-total")).toContainText(
    `~$${before.cost} each`,
  );
});
