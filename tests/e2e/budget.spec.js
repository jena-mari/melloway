import { test, expect } from "@playwright/test";
import { defaultDraft } from "../../src/data/preferences.js";
import { curatedVenuesForDate } from "../../src/data/sydneyVenues.js";
import { schedule, demoMatrix } from "../../src/utils/planner.js";
import { mockMapTiles } from "./fixtures.js";
test.use({ hasTouch: true, reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "curated", recommendations: "planner" } }),
  );
  const prefs = {
    ...defaultDraft(),
    area: "Newtown",
    date: "2026-10-18",
    notes: "matcha and thrifting",
  };
  const stops = [
    "sydney-maeda",
    "sydney-uturn-vintage",
    "sydney-better-read",
  ].map((id) => curatedVenuesForDate(prefs.date).find((v) => v.id === id));
  const bundle = {
    plan: {
      ...schedule(stops, prefs, demoMatrix(stops, prefs.transport), [0, 1, 2]),
      prefs,
      id: "budget-fixture",
      notice: "Sourced estimates.",
    },
    candidates: [],
    matrix: [],
  };
  await page.addInitScript((bundle) => {
    if (!localStorage.getItem("melloway.current"))
      localStorage.setItem("melloway.current", JSON.stringify(bundle));
  }, bundle);
});
const stored = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
async function openBudget(page) {
  await page.locator(".route-summary-total").tap();
  await expect(
    page.getByRole("form", { name: "Activity budgets" }),
  ).toBeVisible();
}
for (const width of [320, 390]) {
  test(`automatic activity budgets can be edited, saved and reset at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/itinerary");
    const initial = await stored(page);
    expect(initial.cost).toBe(44);
    expect(initial.budgetBreakdown.shopping.allowance).toBe(32);
    await expect(
      page.getByRole("form", { name: "Activity budgets" }),
    ).not.toBeVisible();
    await openBudget(page);
    await expect(
      page.getByLabel("shopping budget", { exact: true }),
    ).toHaveAttribute("placeholder", "auto · $32");
    await page.getByLabel("drinks budget", { exact: true }).fill("20");
    await page.getByLabel("shopping budget", { exact: true }).fill("40");
    await page.getByRole("button", { name: "apply", exact: true }).tap();
    await expect.poll(async () => (await stored(page)).cost).toBe(60);
    const changed = await stored(page);
    expect(changed.prefs.activityBudgets).toEqual({ drinks: 20, shopping: 40 });
    expect(changed.stops.map((s) => s.id)).toEqual(
      initial.stops.map((s) => s.id),
    );
    expect(changed.stops[0].estimatedCost).toBe(12);
    expect(changed.stops[1].estimatedCost).toBe(0);
    expect(changed.budgetUnassigned).toBe(20);
    await page
      .getByRole("button", { name: "save this plan", exact: true })
      .tap();
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.saved"))[0],
    );
    expect(saved.prefs.activityBudgets).toEqual(changed.prefs.activityBudgets);
    await page.reload();
    await openBudget(page);
    await expect(
      page.getByLabel("shopping budget", { exact: true }),
    ).toHaveValue("40");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`budget-${width}.png`),
      fullPage: true,
    });
    await page.getByLabel("shopping budget", { exact: true }).fill("80");
    await page.getByRole("button", { name: "apply", exact: true }).tap();
    await expect(page.getByRole("alert")).toContainText("within $80 each");
    expect((await stored(page)).id).toBe(changed.id);
    await page
      .getByRole("button", { name: "reset to auto", exact: true })
      .tap();
    await expect.poll(async () => (await stored(page)).cost).toBe(44);
    expect((await stored(page)).prefs.activityBudgets).toEqual({});
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("lower activity budgets find fitting alternatives and constrain future suggestions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/itinerary");
  await openBudget(page);
  await page.getByLabel("drinks budget", { exact: true }).fill("0");
  await page.getByLabel("shopping budget", { exact: true }).fill("40");
  await page.getByRole("button", { name: "apply", exact: true }).tap();
  await expect
    .poll(async () => (await stored(page)).prefs.activityBudgets.drinks)
    .toBe(0);
  const changed = await stored(page);
  expect(
    changed.stops.every((s) => s.budgetCategory !== "drinks" || s.cost === 0),
  ).toBe(true);
  expect(changed.stops.some((s) => s.tags.includes("Thrifting"))).toBe(true);
  expect(changed.budgetBreakdown.shopping.allowance).toBe(40);
  expect(changed.cost).toBeLessThanOrEqual(80);
  expect(changed.prefs.date).toBe("2026-10-18");
  expect(changed.prefs.time).toBe("11:00");
  await page.goto("/explore");
  await expect(page.locator(".route-extras")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const cafe = page.getByRole("button", {
    name: "add Maeda to route",
    exact: true,
  });
  if (await cafe.count()) await expect(cafe).toBeDisabled();
});
test("changing a shopping spot preserves money already assigned to the route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/itinerary");
  const initial = await stored(page);
  await page.getByRole("button", { name: "edit", exact: true }).tap();
  await page
    .getByRole("button", { name: "change spot", exact: true })
    .nth(1)
    .tap();
  await page.getByLabel("search available spots").fill("Contemporary");
  await page
    .getByRole("button", {
      name: "choose Uturn Newtown Contemporary",
      exact: true,
    })
    .tap();
  await expect
    .poll(async () => (await stored(page)).stops[1].id)
    .toBe("sydney-uturn-contemporary");
  const changed = await stored(page);
  expect(changed.cost).toBe(initial.cost);
  expect(changed.budgetBreakdown.shopping.allowance).toBe(
    initial.budgetBreakdown.shopping.allowance,
  );
  expect(changed.stops.map((s) => s.cost)).toEqual(
    initial.stops.map((s) => s.cost),
  );
});
