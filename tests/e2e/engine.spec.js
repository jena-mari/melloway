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
      .getByRole("button", {
        name: `view ${plan.stops[0].name} details`,
        exact: true,
      })
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
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath("sourced-route.png"),
      fullPage: true,
    });
  });
test("a $20 fine-dining request creates an affordable alternative and retains the user's answers", async ({
  page,
}) => {
  await page.addInitScript(
    (prefs) => localStorage.setItem("melloway.draft", JSON.stringify(prefs)),
    { ...defaultDraft(), budget: 20, notes: "fine dining" },
  );
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".plan-match-notice")).toContainText(
    "instead of Fine dining",
  );
  const plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.cost).toBeLessThanOrEqual(20);
  expect(plan.stops.every((v) => v.source === "curated")).toBe(true);
  expect(plan.stops.some((v) => v.upscale)).toBe(false);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.draft")).budget,
    ),
  ).toBe(20);
});

test("closed shops still generate a nearby open browsing stop after submit and reload", async ({
  page,
}, info) => {
  const prefs = {
    ...defaultDraft(),
    date: "2026-10-18",
    area: "Newtown",
    time: "18:00",
    timeExplicit: true,
    preferences: ["Thrifting"],
  };
  await page.addInitScript(
    (prefs) => localStorage.setItem("melloway.draft", JSON.stringify(prefs)),
    prefs,
  );
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".plan-match-notice")).toContainText(
    "Bookshops instead of Thrifting",
  );
  await expect(page.locator(".route-summary-spot strong")).toHaveText([
    "Better Read Than Dead",
  ]);
  const matchNotice = page.locator(".plan-match-notice");
  await expect(matchNotice.locator("p")).not.toBeVisible();
  await matchNotice.locator("summary").tap();
  await expect(matchNotice.locator("p")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(matchNotice.locator("p")).not.toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      (await page.locator(".result-chrome").boundingBox()).height,
    ).toBeLessThanOrEqual(110);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `/private/tmp/melloway-compact-result-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  let plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.prefs.time).toBe("18:00");
  expect(plan.prefs.date).toBe("2026-10-18");
  expect(
    plan.stops.every(
      (v) => v.source === "curated" && v.activityRole === "bookshop",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "save this plan", exact: true }).tap();
  await page.goto("/favourites");
  await page.getByRole("button", { name: "open plan", exact: true }).tap();
  await expect(page.locator(".plan-match-notice")).toContainText(
    "Bookshops instead of Thrifting",
  );
  await page.reload();
  await expect(page.locator(".route-summary-spot strong")).toHaveText([
    "Better Read Than Dead",
  ]);
  await page
    .getByRole("button", { name: "try another plan", exact: true })
    .tap();
  await expect(
    page.getByRole("button", { name: "try another plan", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".plan-match-notice")).toContainText(
    "Bookshops instead of Thrifting",
  );
  plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.prefs.preferences).toEqual(["Thrifting"]);
  expect(plan.cost).toBeLessThanOrEqual(prefs.budget);
  expect(plan.elapsed).toBeLessThanOrEqual(prefs.duration * 60);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("closest-shop-alternative.png"),
    fullPage: true,
  });
});

test("a closed market day keeps the requested matcha and offers an available browsing alternative", async ({
  page,
}) => {
  const prefs = {
    ...defaultDraft(),
    date: "2026-10-18",
    preferences: ["Flea markets", "Matcha cafés"],
  };
  await page.addInitScript(
    (prefs) => localStorage.setItem("melloway.draft", JSON.stringify(prefs)),
    prefs,
  );
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".plan-match-notice")).toContainText(
    "instead of Flea markets",
  );
  const plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.stops.some((v) => v.tags.includes("Matcha cafés"))).toBe(true);
  expect(plan.stops.some((v) => v.id === "sydney-glebe-markets")).toBe(false);
  expect(plan.prefs.preferences).toEqual(prefs.preferences);
});
