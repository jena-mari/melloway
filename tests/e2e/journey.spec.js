import { test, expect } from "@playwright/test";
import { mockMapTiles } from "./fixtures.js";
const nameInput = (page) => page.getByLabel("what’s ur name?");
async function openStops(page) {
  await expect(page.locator(".stop-body h2").first()).toBeVisible();
}
async function openSaved(page) {
  if (
    !(await page.getByRole("link", { name: "saved", exact: true }).isVisible())
  ) {
    await page.getByRole("button", { name: "Open melloway menu" }).click();
  }
  await page.getByRole("link", { name: "saved", exact: true }).click();
}
async function planDay(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "start", exact: true }).click();
  await nameInput(page).fill("Jena");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page
    .getByLabel("any specific location in mind?")
    .selectOption("Newtown");
  await page.locator(".planning-extra summary").click();
  await page.getByLabel("their name (optional)").fill("Alex");
  await page.getByLabel("start around").fill("11:00");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.locator(".vibe-extra summary").click();
  await page.getByRole("button", { name: "Matcha cafés", exact: true }).click();
  await page.getByRole("button", { name: "Bookshops", exact: true }).click();
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await openStops(page);
}
async function swapOnly(page, index) {
  await openStops(page);
  await expect(page.locator(".stop-body h2").nth(index)).toBeVisible();
  const before = await page.locator(".stop-body h2").allTextContents();
  const buttons = page.getByRole("button", { name: "swap this stop" });
  await buttons.nth(index).click();
  await expect(page.locator(".stop-body h2").nth(index)).not.toHaveText(
    before[index],
  );
  const after = await page.locator(".stop-body h2").allTextContents();
  expect(before.filter((_, i) => i !== index)).toEqual(
    after.filter((_, i) => i !== index),
  );
}
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  // Tests are deterministic demo flows and never charge external APIs.
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "demo" } }),
  );
});

test("plan, replace, save, reopen, replace again, and start fresh", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await planDay(page);
  const titles = await page.locator(".stop-body h2").allTextContents();
  expect(titles.length).toBeGreaterThanOrEqual(3);
  expect(titles.length).toBeLessThanOrEqual(5);
  expect(new Set(titles).size).toBe(titles.length);
  await swapOnly(page, 1);
  await page
    .getByRole("button", { name: "the details", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("No verified rating or availability in demo mode."),
  ).toBeVisible();
  await page.getByRole("link", { name: "location spotlight" }).click();
  await expect(page.getByText("LOCATION SPOTLIGHT")).toBeVisible();
  await page.getByRole("link", { name: "back to ur day" }).click();
  await page.getByRole("button", { name: "lock this in" }).click();
  await openSaved(page);
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.getByRole("button", { name: "open plan" }).click();
  await swapOnly(page, 1);
  await page.getByRole("link", { name: "tweak the details" }).click();
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Newtown",
  );
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "try another plan" }).click();
  await expect(
    page.getByRole("button", { name: "try another plan" }),
  ).toBeEnabled();
  const directions = page.getByRole("link", { name: "open Google Maps" });
  await expect(directions).toHaveAttribute("href", /travelmode=walking/);
  await page.getByRole("link", { name: "start a new plan" }).click();
  await page.getByRole("button", { name: "start", exact: true }).click();
  await expect(nameInput(page)).toHaveValue("");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await openSaved(page);
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.getByRole("button", { name: /Remove plan/ }).click();
  await expect(page.locator(".collection-card")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "a little empty, a lot of possibility.",
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("draft and multi-select preferences persist through back navigation and reload", async ({
  page,
}) => {
  await page.goto("/plan/profile");
  await nameInput(page).fill("Jena");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page
    .getByLabel("any specific location in mind?")
    .selectOption("Surry Hills");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.locator(".vibe-extra summary").click();
  await page.getByRole("button", { name: "Coffee shops", exact: true }).click();
  await page.getByRole("button", { name: "Museums", exact: true }).click();
  await page.reload();
  await page.locator(".vibe-extra summary").click();
  await expect(
    page.getByRole("button", { name: "Coffee shops", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Museums", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Surry Hills",
  );
  await page.getByRole("link", { name: "back", exact: true }).click();
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(nameInput(page)).toHaveValue("Jena");
});

test("community posts, ratings and likes persist; event filters work", async ({
  page,
}) => {
  await page.goto("/community");
  await page.getByRole("button", { name: "add a memory" }).click();
  await page.getByLabel("give it a little title").fill("A lovely day");
  await page
    .getByLabel("the little details")
    .fill("A slow afternoon with good company.");
  await page.getByLabel("your rating").selectOption("4");
  await page.getByRole("button", { name: "save to device feed" }).click();
  await page.getByRole("button", { name: "Like A lovely day" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A lovely day" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Like A lovely day" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/events");
  await page.getByRole("button", { name: "markets", exact: true }).click();
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "a weekend market wander" }),
  ).toBeVisible();
});

test("impossible hours show a recoverable empty state", async ({ page }) => {
  await page.goto("/plan/details");
  await page.locator(".planning-extra summary").click();
  await page.getByLabel("start around").fill("23:30");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "No three-stop plan fits",
  );
  await page.getByRole("link", { name: "tweak the details" }).click();
  await page.locator(".planning-extra summary").click();
  await expect(page.getByLabel("start around")).toHaveValue("23:30");
});

for (const width of [320, 390]) {
  test(`screens fit a ${width}px iPhone viewport and reduced motion`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await planDay(page);
    for (const path of [
      "/",
      "/plan/profile",
      "/plan/about",
      "/plan/notes",
      "/plan/details",
      "/plan/vibes",
      "/itinerary",
      "/favourites",
      "/community",
      "/events",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        path,
      ).toBe(true);
    }
    await page.goto("/itinerary");
    await page.screenshot({
      path: info.outputPath(`itinerary-${width}.png`),
      fullPage: true,
    });
  });
}

test("the introduction stays centred and the rest of the app keeps phone navigation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".app-topbar")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  const start = await page
    .getByRole("button", { name: "start", exact: true })
    .boundingBox();
  expect(start.y).toBeGreaterThan(300);
  expect(start.y + start.height).toBeLessThan(600);
  await page.screenshot({ path: info.outputPath("phone-home.png") });
  await page.getByRole("button", { name: "start", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "Planning progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "continue", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("phone-profile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.locator(".app-shell").evaluate((e) => e.offsetWidth),
  ).toBeLessThanOrEqual(480);
  await page.goto("/favourites");
  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = page.getByRole("navigation", { name: "Main navigation" });
  await expect(tabs).toBeVisible();
  const box = await tabs.boundingBox();
  expect(box.y + box.height).toBeCloseTo(844, 0);
});

test("submitting the introduction works without randomUUID in phone previews", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
  await planDay(page);
  await expect(
    page.getByRole("heading", { name: "here’s ur date!", exact: true }),
  ).toBeVisible();
  const currentId = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.current")).plan.id,
    );
  const firstId = await currentId();
  expect(firstId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  await swapOnly(page, 1);
  const secondId = await currentId();
  expect(secondId).not.toBe(firstId);
  expect(secondId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  await page.getByRole("button", { name: "lock this in", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "saved · sync again", exact: true }),
  ).toBeVisible();
  expect(await currentId()).toBe(secondId);
});
