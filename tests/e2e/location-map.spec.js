import { test, expect } from "@playwright/test";
import {
  mockLocationSearch,
  mockMapTiles,
  chooseArea,
  continueQuestions,
} from "./fixtures.js";

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockLocationSearch(page);
  await mockMapTiles(page);
});
for (const width of [320, 390]) {
  test(`Sydney area map selects and persists locations at ${width}px`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
    await page.goto("/plan/details?q=2");
    const map = page.getByRole("region", {
      name: "Choose an area on the Sydney map",
    });
    await expect(map).toBeVisible();
    await expect(page.locator(".location-area-pin")).toHaveCount(4);
    await expect(page.locator(".location-map-status")).toHaveCount(0);
    await expect(
      map.getByRole("button", { name: "Choose Sydney CBD", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".location-map .google-map-canvas")).toHaveAttribute("data-map-state", "ready");
    await expect(page.locator('script[src*="maps.googleapis.com/maps/api/js"]')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`location-map-${width}.png`),
      fullPage: true,
    });
    await map.getByRole("button", { name: "Zoom in", exact: true }).tap();
    await page
      .getByRole("button", { name: "show all Sydney areas", exact: true })
      .tap();
    await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
      "Sydney CBD",
    );
    await expect(page).toHaveURL(/\/plan\/details\?q=2$/);
    // Labels are tappable too; users do not have to hit the small geographic dot.
    await page.locator(".location-area-pin-1 .location-area-name").tap();
    await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
      "Surry Hills",
    );
    await expect(
      map.getByRole("button", { name: "Choose Surry Hills", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await chooseArea(page, "Newtown");
    await expect(
      map.getByRole("button", { name: "Choose Newtown", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await continueQuestions(page);
    await expect(page.getByLabel("budget each", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("link", { name: "back", exact: true }).click();
    await expect(
      map.getByRole("button", { name: "Choose Newtown", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const eastern = map.getByRole("button", {
      name: "Choose Eastern Suburbs",
      exact: true,
    });
    await eastern.focus();
    await page.keyboard.press(" ");
    await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
      "Eastern Suburbs",
    );
    await expect(eastern).toHaveAttribute("aria-pressed", "true");
    const cbd = map.getByRole("button", {
      name: "Choose Sydney CBD",
      exact: true,
    });
    await cbd.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
      "Sydney CBD",
    );
    await page
      .getByRole("button", { name: "anywhere in Sydney is good", exact: true })
      .tap();
    await expect(
      page.locator('.location-area-pin[aria-pressed="true"]'),
    ).toHaveCount(0);
    await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
      "",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("unavailable Google Maps still allows selecting an area and continuing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.abort(),
  );
  await page.goto("/plan/details?q=2");
  await expect(page.locator(".location-map-status")).toHaveText(
    /Google Maps unavailable/,
  );
  await page.getByRole("button", { name: "Choose Newtown", exact: true }).tap();
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Newtown",
  );
  await continueQuestions(page);
  await expect(page.getByLabel("budget each", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.draft")).area,
    ),
  ).toBe("Newtown");
});
