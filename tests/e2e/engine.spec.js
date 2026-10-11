import { test, expect } from "@playwright/test";
import { defaultDraft } from "../../src/data/preferences.js";
import { mockMapTiles } from "./fixtures.js";
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "curated", recommendations: "planner" } }),
  );
});
const cases = [
  {
    name: "romantic evening",
    notes: "romantic evening with speakeasies and fancy dinner",
    budget: 170,
    sequence: ["bar", "meal", "bar"],
    time: "18:00",
  },
  {
    name: "Newtown matcha and thrifting",
    area: "Newtown",
    notes: "matcha, thrifting and a slow afternoon",
    sequence: ["cafe", "shop", "bookshop"],
    time: "11:00",
  },
  {
    name: "affordable art and walking",
    notes: "art, walking and cheap food",
    budget: 40,
    sequence: ["culture", "walk", "meal"],
    time: "11:00",
  },
];
for (const scenario of cases)
  test(`${scenario.name} produces a sourced, personalised route after submit`, async ({
    page,
  }, info) => {
    const prefs = { ...defaultDraft(), date: "2026-10-18", ...scenario };
    await page.addInitScript(
      (prefs) => localStorage.setItem("melloway.draft", JSON.stringify(prefs)),
      prefs,
    );
    await page.goto("/plan/notes");
    await page.getByRole("button", { name: "submit", exact: true }).tap();
    await expect(page).toHaveURL(/\/itinerary$/);
    const plan = await page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.current")).plan,
    );
    expect(plan.sequence).toEqual(scenario.sequence);
    expect(plan.prefs.time).toBe(scenario.time);
    expect(
      plan.stops.every(
        (v) => v.source === "curated" && !!v.reason && !!v.website,
      ),
    ).toBe(true);
    expect(plan.cost).toBeLessThanOrEqual(prefs.budget);
    expect(plan.elapsed).toBeLessThanOrEqual(prefs.duration * 60);
    await expect(page.locator(".route-summary-spot strong")).toHaveText(
      plan.stops.map((v) => v.name),
    );
    await expect(page.locator(".map-preview")).toBeVisible();
    await page
      .getByRole("button", { name: "the details", exact: true })
      .first()
      .tap();
    const dialog = page.getByRole("dialog", {
      name: plan.stops[0].name,
      exact: true,
    });
    await expect(dialog).toContainText(plan.stops[0].reason);
    await expect(
      dialog.getByRole("link", { name: "venue source" }),
    ).toHaveAttribute("href", plan.stops[0].website);
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0,0);
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath("sourced-route.png"),
      fullPage: true,
    });
  });
test("a $20 fine-dining request explains the mismatch and retains the user's answers", async ({
  page,
}) => {
  await page.addInitScript(
    (prefs) => localStorage.setItem("melloway.draft", JSON.stringify(prefs)),
    { ...defaultDraft(), budget: 20, notes: "fine dining" },
  );
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page.getByRole("status")).toContainText("above your $20 budget");
  await expect(page.locator(".stop-card")).toHaveCount(0);
  await page
    .getByRole("link", { name: "tweak the details", exact: true })
    .tap();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.draft")).budget,
    ),
  ).toBe(20);
});
