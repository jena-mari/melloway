import { test, expect } from "@playwright/test";
import {
  mockLocationSearch,
  mockMapTiles,
  continueQuestions,
} from "./fixtures.js";

const questions = [
  "/plan/profile",
  "/plan/about",
  "/plan/about?q=1",
  "/plan/details",
  "/plan/details?q=1",
  "/plan/details?q=2",
  "/plan/details?q=3",
  "/plan/details?q=4",
  "/plan/details?q=5",
  "/plan/details?q=6",
  "/plan/details?q=7",
  "/plan/details?q=8",
  "/plan/vibes",
  "/plan/vibes?q=1",
  "/plan/vibes?q=3",
  "/plan/food",
  "/plan/food?q=1",
  "/plan/notes",
];
const back = (page) => page.getByRole("link", { name: "back", exact: true });
async function atQuestion(page, path) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return url.pathname + url.search;
    })
    .toBe(path);
  await expect(page.locator(".question-turn")).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await mockLocationSearch(page);
  await mockMapTiles(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const width of [320, 390]) {
  test(`all questions share an anchor and Back retraces optional questions at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
    await page.goto(questions[0]);
    await page.evaluate(() => document.fonts.ready);
    const anchor = await page.locator(".question-turn h1").boundingBox();
    for (const [index, path] of questions.entries()) {
      await atQuestion(page, path);
      const heading = page.locator(".question-turn h1");
      const bounds = await heading.boundingBox();
      expect(bounds.x).toBeCloseTo(anchor.x, 0);
      expect(bounds.y).toBeCloseTo(anchor.y, 0);
      expect(
        await heading.evaluate((el) => getComputedStyle(el).textAlign),
      ).toBe("start");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (path === "/plan/profile")
        await page.getByLabel("what’s ur name?").fill("Jena");
      if (path === "/plan/about") {
        await page.getByLabel("age", { exact: true }).fill("27");
        await page
          .locator(".app-shell")
          .evaluate((el) => el.classList.add("keyboard-open"));
        expect((await heading.boundingBox()).y).toBeCloseTo(anchor.y, 0);
        await page
          .locator(".app-shell")
          .evaluate((el) => el.classList.remove("keyboard-open"));
      }
      if (path === "/plan/details?q=4")
        await page.getByLabel("their name (optional)").fill("Alex");
      if (path === "/plan/food")
        await page
          .getByRole("button", { name: "Asian food", exact: true })
          .click();
      if (path === "/plan/food?q=1") {
        await page.getByRole("button", { name: "Cozy", exact: true }).click();
        await page.screenshot({
          path: info.outputPath(`food-vibe-${width}.png`),
          fullPage: true,
        });
      }
      if (path === "/plan/details?q=5" || path === "/plan/vibes") {
        await page.screenshot({
          path: info.outputPath(
            `${path.includes("vibes") ? "ideas" : "calendar"}-${width}.png`,
          ),
          fullPage: true,
        });
      }
      if (path === "/plan/notes") break;
      if (path === "/plan/details?q=3")
        await page.getByRole("button", { name: /a few more details/ }).click();
      else if (path === "/plan/vibes")
        await page
          .getByRole("button", { name: /make it more ur vibe/ })
          .click();
      else await continueQuestions(page);
      await atQuestion(page, questions[index + 1]);
    }
    await page
      .getByLabel("anything else for ur plan?")
      .fill("no coffee please");
    await page.reload();
    for (const path of questions.slice(0, -1).reverse()) {
      await back(page).click();
      await atQuestion(page, path);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(
        (await page.locator(".question-turn h1").boundingBox()).y,
      ).toBeCloseTo(anchor.y, 0);
      if (path === "/plan/details?q=4")
        await expect(page.getByLabel("their name (optional)")).toHaveValue(
          "Alex",
        );
      if (path === "/plan/about")
        await expect(page.getByLabel("age", { exact: true })).toHaveValue("27");
      if (path === "/plan/food")
        await expect(
          page.getByRole("button", { name: "Asian food", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      if (path === "/plan/food?q=1")
        await expect(
          page.getByRole("button", { name: "Cozy", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.getByLabel("what’s ur name?")).toHaveValue("Jena");
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("melloway.draft")).notes,
      ),
    ).toBe("no coffee please");
    await back(page).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test("Back remembers section exits when optional questions are omitted or skipped", async ({
  page,
}) => {
  await page.goto("/plan/details?q=3");
  await continueQuestions(page, 4);
  await atQuestion(page, "/plan/notes");
  await page.reload();
  await back(page).click();
  await atQuestion(page, "/plan/food?q=1");
  await back(page).click();
  await atQuestion(page, "/plan/food");
  await back(page).click();
  await atQuestion(page, "/plan/vibes");
  await back(page).click();
  await atQuestion(page, "/plan/details?q=3");
  await page.goto("/plan/about");
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await atQuestion(page, "/plan/details");
  await page.reload();
  await back(page).click();
  await atQuestion(page, "/plan/about");
  await page.goto("/plan/details?q=2");
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await atQuestion(page, "/plan/vibes");
  await back(page).click();
  await atQuestion(page, "/plan/details?q=2");
});

test("opening a section directly has a sensible previous question", async ({
  page,
}) => {
  await page.goto("/plan/details");
  await back(page).click();
  await atQuestion(page, "/plan/about?q=1");
  await page.goto("/plan/vibes");
  await back(page).click();
  await atQuestion(page, "/plan/details?q=3");
});

test("the main flow asks food and dining vibe, and both can be skipped independently", async ({
  page,
}) => {
  await page.goto("/plan/vibes");
  await continueQuestions(page);
  await atQuestion(page, "/plan/food");
  await expect(
    page.getByRole("button", { name: "Asian food", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await atQuestion(page, "/plan/food?q=1");
  await expect(
    page.getByRole("button", { name: "Cozy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await atQuestion(page, "/plan/notes");
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("melloway.draft")),
  );
  expect(draft.preferences).toEqual([]);
  expect(draft.diningVibes).toEqual([]);
  await back(page).click();
  await atQuestion(page, "/plan/food?q=1");
});

test("food and dining answers reach a sourced itinerary after submit", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "curated", recommendations: "planner" } }),
  );
  await page.goto("/plan/vibes");
  await continueQuestions(page);
  await page.getByRole("button", { name: "Asian food", exact: true }).click();
  await continueQuestions(page);
  await page.getByRole("button", { name: "Chill", exact: true }).click();
  await continueQuestions(page);
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  const plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.prefs.preferences).toContain("Asian food");
  expect(plan.prefs.diningVibes).toEqual(["Chill"]);
  expect(
    plan.stops.some(
      (v) => v.activityRole === "meal" && v.tags.includes("Asian food"),
    ),
  ).toBe(true);
  expect(plan.stops.every((v) => v.source === "curated")).toBe(true);
  expect(plan.cost).toBeLessThanOrEqual(plan.prefs.budget);
  expect(plan.prefs.time).toBe("11:00");
});
