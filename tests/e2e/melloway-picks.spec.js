import { test, expect } from "@playwright/test";
import { mockMapTiles } from "./fixtures.js";
import { communityExamples } from "../../src/data/community.js";

const names = [
  "Outta Coffee",
  "Issho Cafe",
  "Matcha-Ya",
  "The Sneaker Laundry",
  "Chubby Cubby Cafe",
];
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-11T01:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMapTiles(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        venues: "curated",
        recommendations: "planner",
        socialDiscovery: "unavailable",
      },
    }),
  );
});

test("browse and save a melloway pick without changing the existing route or onboarding", async ({
  page,
}) => {
  const current = {
    plan: communityExamples()[1].plan,
    candidates: [],
    matrix: [],
  };
  await page.addInitScript((route) => {
    if (!localStorage.getItem("melloway.current"))
      localStorage.setItem("melloway.current", JSON.stringify(route));
  }, current);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "start", exact: true }),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    localStorage.getItem("melloway.draft"),
  );
  await page
    .getByRole("link", { name: "melloway picks ↗", exact: true })
    .click();
  await expect(page).toHaveURL(/\/picks$/);
  await page
    .getByRole("link", { name: "view Sydney Matcha Crawl", exact: true })
    .click();
  await page.getByLabel("choose a day").fill("2026-10-12");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "explore", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".pick-stop-list strong")).toHaveText(names);
  await expect(page.locator(".pick-stop-time")).toHaveText([
    "10:30 am",
    "11:15 am",
    "12:00 pm",
    "12:45 pm",
    "1:30 pm",
  ]);
  await expect(page.locator(".pick-stop-list")).toContainText("303 Pitt St");
  await expect(page.locator(".pick-stop-list")).toContainText(
    "Westfield Sydney, Level 1",
  );
  const before = await page.evaluate(() =>
    localStorage.getItem("melloway.current"),
  );
  await page
    .getByRole("button", { name: "save Sydney Matcha Crawl", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "unsave Sydney Matcha Crawl" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() => localStorage.getItem("melloway.current")),
  ).toBe(before);
  expect(
    await page.evaluate(() => localStorage.getItem("melloway.draft")),
  ).toBe(draft);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/melloway-pick-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto("/favourites");
  await expect(
    page.getByRole("heading", { name: "Sydney Matcha Crawl", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("melloway pick", { exact: true })).toBeVisible();
});

test("pick details retain the day; using the route keeps all five stops and edits only the personal copy", async ({
  page,
}) => {
  await page.goto("/picks/sydney-matcha-crawl?date=2026-10-12");
  await page
    .getByRole("button", { name: "open Matcha-Ya details", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("12:00 pm");
  await expect(dialog).toContainText("Opens at noon");
  await dialog.getByRole("link", { name: "location spotlight" }).click();
  await expect(page).toHaveURL(
    /\/picks\/sydney-matcha-crawl\/venue\/pick-matcha-matchaya\?date=2026-10-12/,
  );
  await page.getByRole("link", { name: "back to ur day" }).click();
  await expect(page.getByLabel("choose a day")).toHaveValue("2026-10-12");
  await page
    .getByRole("button", { name: "make this my day", exact: true })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".route-summary-spot strong")).toHaveText(names);
  const plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.prefs.date).toBe("2026-10-12");
  expect(plan.prefs.time).toBe("10:30");
  await page.getByRole("button", { name: "edit", exact: true }).click();
  await page
    .getByRole("button", { name: "remove Issho Cafe from route", exact: true })
    .click();
  await expect(page.locator(".route-summary-spot strong")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".route-summary-spot strong")).toHaveCount(4);
  await page.goto("/picks/sydney-matcha-crawl?date=2026-10-12");
  await expect(page.locator(".pick-stop-list strong")).toHaveText(names);
});

test("unconfirmed Sunday hours keep the route visible and cannot overwrite the current day", async ({
  page,
}) => {
  await page.goto("/picks/sydney-matcha-crawl?date=2026-10-11");
  await expect(page.locator(".pick-stop-list strong")).toHaveText(names);
  await expect(
    page.getByRole("button", { name: "make this my day", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "save Sydney Matcha Crawl", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/This day has no confirmed window/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "open Matcha-Ya details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "location spotlight" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("choose a day").fill("2026-10-12");
  await expect(
    page.getByRole("button", { name: "make this my day", exact: true }),
  ).toBeEnabled();
  await page.goto("/explore");
  await page.getByLabel("search suggestions").fill("Sneaker Laundry");
  await expect(
    page.getByRole("link", { name: "view Sydney Matcha Crawl" }),
  ).toBeVisible();
  await expect(page.locator(".community-empty")).toHaveCount(0);
});
