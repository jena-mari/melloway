import { test, expect } from "@playwright/test";
import { mockMapTiles } from "./fixtures.js";
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "demo" } }),
  );
});
test("landing follows the wireframe and starts the introduction", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "melloway", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".intro-bubble")).toHaveCount(0);
  await expect(page.locator(".floating-doodle")).toHaveCount(2);
  await expect(page.locator(".app-topbar")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  const start = page.getByRole("button", { name: "start", exact: true });
  const bounds = await start.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.y).toBeGreaterThan(300);
  expect(bounds.y + bounds.height).toBeLessThan(600);
  await page.getByRole("button", { name: "Open melloway menu" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "saved", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("landing.png") });
  await start.click();
  await expect(page).toHaveURL(/\/plan\/profile$/);
  await expect(page.getByLabel("what’s ur name?")).toBeVisible();
  expect(errors).toEqual([]);
});
test("name and age stay separate, with working back, skip and saved answers", async ({
  page,
}, info) => {
  await page.goto("/plan/profile");
  await page.getByLabel("what’s ur name?").fill("Jena");
  await expect(page.getByLabel("age", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("name.png") });
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/about$/);
  await expect(
    page.getByRole("heading", { name: /cool name,.*Jena/ }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page.getByLabel("age", { exact: true }).press("ArrowRight");
  const gender = page.getByRole("button", { name: "non-binary", exact: true });
  await gender.click();
  await expect(gender).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByLabel("age", { exact: true })).toHaveValue("27");
  await expect(gender).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("age.png") });
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.getByLabel("what’s ur name?")).toHaveValue("Jena");
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/about$/);
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/details$/);
});
test("hanging out keeps company, occasion, area and budget together", async ({
  page,
}, info) => {
  await page.goto("/plan/details");
  await page.getByRole("button", { name: "a friend", exact: true }).click();
  await page.getByRole("button", { name: "just friends", exact: true }).click();
  await page
    .getByLabel("any specific location in mind?")
    .selectOption("Newtown");
  await page.getByLabel("budget each", { exact: true }).press("ArrowRight");
  await page.getByText("a few more details", { exact: false }).click();
  await page.getByLabel("their name (optional)").fill("Alex");
  await page.getByLabel("start around").fill("12:00");
  await page
    .getByRole("button", { name: "Public transport", exact: true })
    .click();
  await page.getByLabel("how long have we got?").selectOption("6");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("hanging-out.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Newtown",
  );
  await expect(page.getByLabel("budget each", { exact: true })).toHaveValue(
    "85",
  );
  await expect(
    page.getByRole("button", { name: "just friends", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("a few more details", { exact: false }).click();
  await expect(page.getByLabel("start around")).toHaveValue("12:00");
  await expect(page.getByLabel("how long have we got?")).toHaveValue("6");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/vibes$/);
});
test("illustrated ideas can be browsed and preferences still support multi-select", async ({
  page,
}, info) => {
  await page.goto("/plan/vibes");
  await expect(page.locator(".idea-caption")).toHaveText(
    "flea market + matcha",
  );
  await page.getByRole("button", { name: "Next idea", exact: true }).click();
  await expect(page.locator(".idea-caption")).toHaveText(
    "vintage finds + cute photos",
  );
  await page
    .getByRole("button", { name: "Previous idea", exact: true })
    .click();
  await expect(page.locator(".idea-caption")).toHaveText(
    "flea market + matcha",
  );
  await page
    .getByRole("button", { name: "bookshop browsing + coffee", exact: true })
    .click();
  await expect(page.locator(".idea-caption")).toHaveText(
    "bookshop browsing + coffee",
  );
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("date-idea.png") });
  await page.locator(".vibe-extra summary").click();
  const coffee = page.getByRole("button", {
    name: "Coffee shops",
    exact: true,
  });
  const museums = page.getByRole("button", { name: "Museums", exact: true });
  await coffee.click();
  await museums.click();
  await page.reload();
  await expect(page.locator(".idea-caption")).toHaveText(
    "bookshop browsing + coffee",
  );
  await page.locator(".vibe-extra summary").click();
  await expect(coffee).toHaveAttribute("aria-pressed", "true");
  await expect(museums).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/notes$/);
});
test("the lock-in screen keeps free-text notes through back navigation and uses them in planning", async ({
  page,
}, info) => {
  await page.goto("/plan/notes");
  const notes = page.getByLabel("anything else for ur plan?");
  await notes.fill("we love matcha and books. no coffee please.");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(notes).toHaveValue(
    "we love matcha and books. no coffee please.",
  );
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("lock-it-in.png") });
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  const prefs = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan.prefs,
  );
  expect(prefs.notes).toBe("we love matcha and books. no coffee please.");
  expect(prefs.preferences).toContain("Matcha cafés");
  expect(prefs.preferences).toContain("Bookshops");
  expect(prefs.preferences).not.toContain("Coffee shops");
});
test("loading reflects a pending request and recovers when discovery completes", async ({
  page,
}, info) => {
  await page.unroute("**/api/status");
  let release;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/status", async (route) => {
    await response;
    await route.fulfill({ json: { venues: "demo" } });
  });
  await page.goto("/generating");
  await expect(
    page.getByRole("heading", { name: "loading...", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "finding spots that fit ur vibe",
  );
  await page.waitForTimeout(500);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("loading.png") });
  release();
  await expect(page).toHaveURL(/\/itinerary$/);
});
test("touch swipe changes the suggestion without changing the screen", async ({
  page,
}) => {
  await page.goto("/plan/vibes");
  const window = page.locator(".idea-window");
  await expect(window).toBeVisible();
  await page.waitForTimeout(450);
  const box = await window.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width * 0.75,
    y = box.y + box.height * 0.5;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 6; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - i * 14, y }],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".idea-caption")).toHaveText(
    "vintage finds + cute photos",
  );
  await expect(page).toHaveURL(/\/plan\/vibes$/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next idea", exact: true }).tap();
  await expect(page.locator(".idea-caption")).toHaveText(
    "bookshop browsing + coffee",
  );
});
test("map-first results expand the map and retain other cards and open details on swaps", async ({
  page,
}, info) => {
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".plan-summary h2")).toBeVisible();
  await expect(page.locator(".stop-card").first()).toBeVisible();
  const summary = await page.locator(".plan-summary").boundingBox();
  const map = await page.locator(".route-map").boundingBox();
  expect(summary.y).toBeGreaterThanOrEqual(map.y + map.height - 5);
  await expect(page.locator(".stop-photo")).toHaveCount(
    await page.locator(".summary-stops li").count(),
  );
  await expect(page.locator(".map-preview .route-pin").first()).toBeVisible();
  const count = await page.locator(".summary-stops li").count();
  const numbers = (
    await page.locator(".map-preview .pin-numbers").allTextContents()
  )
    .flatMap((s) => s.split(" · ").map(Number))
    .sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("map-first-result.png"),
    fullPage: true,
  });
  const expand = page.getByRole("button", { name: "expand map", exact: true });
  await expand.tap();
  const dialog = page.getByRole("dialog", { name: "ur day, mapped out." });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Map of your stops" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const zoomBox = await dialog
    .getByRole("button", { name: "Zoom in" })
    .boundingBox();
  expect(zoomBox.width).toBeGreaterThanOrEqual(44);
  expect(zoomBox.height).toBeGreaterThanOrEqual(44);
  const pin = dialog.locator(".route-pin").first();
  const position = await pin.getAttribute("style");
  await dialog.getByRole("button", { name: "Zoom in" }).tap();
  await expect(pin).not.toHaveAttribute("style", position);
  await expect(
    dialog.getByRole("link", { name: "get directions" }),
  ).toHaveAttribute("href", /travelmode=walking/);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(expand).toBeFocused();
  await page
    .getByRole("button", { name: "view stop cards", exact: true })
    .tap();
  await expect(page.locator(".stop-card").first()).toBeVisible();
  const details = page.getByRole("button", {
    name: "the details",
    exact: true,
  });
  await details.first().tap();
  await expect(details.first()).toHaveAttribute("aria-expanded", "true");
  const before = await page.locator(".stop-body h2").allTextContents();
  await page
    .locator(".stop-card")
    .first()
    .evaluate((el) => {
      window.unchangedStop = el;
    });
  await page
    .getByRole("button", { name: "swap this stop", exact: true })
    .nth(1)
    .tap();
  await expect(page.locator(".stop-body h2").nth(1)).not.toHaveText(before[1]);
  expect(
    await page
      .locator(".stop-card")
      .first()
      .evaluate((el) => el === window.unchangedStop),
  ).toBe(true);
  await expect(details.first()).toHaveAttribute("aria-expanded", "true");
  expect(
    (await page.locator(".stop-body h2").allTextContents()).filter(
      (_, i) => i !== 1,
    ),
  ).toEqual(before.filter((_, i) => i !== 1));
  await details.first().tap();
  await expect(details.first()).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".stop-photo")).toHaveCount(
    await page.locator(".summary-stops li").count(),
  );
  await expand.tap();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "close map" }).tap();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "explore community" }),
  ).toHaveAttribute("href", "/community");
  await expect(
    page.getByRole("button", { name: "lock this in" }),
  ).toBeEnabled();
});

test("unavailable map tiles leave the plan, details and save action usable", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".map-status")).toHaveText(
    "street map couldn’t load. ur stops are still below.",
  );
  await page
    .getByRole("button", { name: "the details", exact: true })
    .first()
    .tap();
  await expect(page.locator(".stop-photo").first()).toBeVisible();
  await page.getByRole("button", { name: "lock this in", exact: true }).tap();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved on this device." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "open Google Maps" }),
  ).toHaveAttribute("href", /waypoints=/);
});

test("Google Places plans keep ordered directions without using demo map tiles", async ({
  page,
}) => {
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".map-preview .route-pin").first()).toBeVisible();
  await page.route("https://www.google.com/maps/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Google map test fixture</p>",
    }),
  );
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("melloway.current"));
    current.plan.stops = current.plan.stops.map((stop) => ({
      ...stop,
      source: "google",
    }));
    localStorage.setItem("melloway.current", JSON.stringify(current));
  });
  let tileRequests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith("https://tile.openstreetmap.org/"))
      tileRequests++;
  });
  await page.reload();
  await expect(page.locator(".route-map")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  expect(tileRequests).toBe(0);
  if (await page.locator(".google-route-map").count()) {
    await expect(page.locator(".google-route-map")).toHaveAttribute(
      "src",
      /google.com\/maps\/embed\/v1\/directions/,
    );
  } else {
    await expect(
      page.getByRole("link", { name: "see the route", exact: true }),
    ).toHaveAttribute("href", /waypoints=/);
  }
  await page.getByRole("button", { name: "expand map", exact: true }).tap();
  await expect(page.getByRole("dialog").locator("ol li")).toHaveCount(
    await page.locator(".summary-stops li").count(),
  );
  await page.getByRole("button", { name: "close map", exact: true }).tap();
  await expect(
    page.getByRole("link", { name: "open Google Maps" }),
  ).toHaveAttribute("href", /travelmode=walking/);
});

test("local Maple Shore and Outfit fonts finish loading", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('48px "Maple Shore"')),
  ).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('16px "Outfit"'))).toBe(
    true,
  );
  await expect(page.locator(".intro-logo")).toHaveCSS(
    "font-family",
    '"Maple Shore", cursive',
  );
  await expect(page.locator("body")).toHaveCSS(
    "font-family",
    "Outfit, sans-serif",
  );
});

test("preset introduction types in order without moving the name input", async ({
  page,
}, info) => {
  await page.goto("/plan/profile");
  const prompts = page.locator(".typed-prompts");
  await expect(prompts).toHaveAttribute("data-typing", "true");
  // The accessible heading is complete even while its visual copy is typing.
  await expect(
    page.getByRole("heading", { name: "hey there,", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  const input = page.getByLabel("what’s ur name?");
  const before = await input.boundingBox();
  await expect(prompts.locator("h1 .typed-ink")).toHaveText("hey there,");
  await page.screenshot({ path: info.outputPath("introduction-typing.png") });
  await expect(prompts).toHaveAttribute("data-typing", "false");
  await expect(prompts.locator("p .typed-ink").last()).toHaveText(
    "let’s start with an introduction. what’s ur name?",
  );
  const after = await input.boundingBox();
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
  await expect(prompts.locator(".typing-caret")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("introduction-complete.png") });
});

test("typing never blocks answering or skipping, and returning keeps the answer", async ({
  page,
}) => {
  await page.goto("/plan/profile");
  const input = page.getByLabel("what’s ur name?");
  await input.tap();
  await expect(page.locator(".typed-prompts")).toHaveAttribute(
    "data-typing",
    "false",
  );
  await input.fill("Jena");
  await page.getByRole("button", { name: "continue", exact: true }).tap();
  await expect(page).toHaveURL(/\/plan\/about$/);
  await page.getByRole("link", { name: "back", exact: true }).tap();
  await expect(input).toHaveValue("Jena");
  await expect(page.locator(".typed-prompts")).toHaveAttribute(
    "data-typing",
    "false",
  );
  await page.reload();
  await expect(input).toHaveValue("Jena");
  await expect(page.locator(".typed-prompts")).toHaveAttribute(
    "data-typing",
    "false",
  );
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .tap();
  await expect(page).toHaveURL(/\/plan\/about$/);
});

test("reduced motion shows the complete preset introduction immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/plan/profile");
  const prompts = page.locator(".typed-prompts");
  await expect(prompts).toHaveAttribute("data-typing", "false");
  await expect(prompts.locator("p .typed-ink").last()).toHaveText(
    "let’s start with an introduction. what’s ur name?",
  );
  await expect(prompts.locator(".typing-caret")).toHaveCount(0);
  await expect(page.getByLabel("what’s ur name?")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an interrupted generation can retry without repeating the introduction", async ({
  page,
}) => {
  let interrupted = true;
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: interrupted ? "google" : "demo" } }),
  );
  await page.route("**/api/venues", async (route) => {
    // An incomplete discovery response must show recovery instead of a blank result.
    await route.fulfill({
      json: {
        venues: Array.from({ length: 3 }, (_, i) => ({
          id: `incomplete-${i}`,
          name: "Incomplete response",
          lat: -33.872,
          lng: 151.208,
          cost: 10,
        })),
      },
    });
    interrupted = false;
  });
  await page.goto("/plan/notes");
  await page
    .getByLabel("anything else for ur plan?")
    .fill("we love matcha and vintage finds");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(
    page.getByRole("heading", { name: "a little hiccup.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "try again", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(
    page.getByRole("heading", { name: "here’s ur date!", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("melloway.current")).plan.prefs.notes,
    ),
  ).toBe("we love matcha and vintage finds");
});

test("result search, filters and map selection preserve the full generated day", async ({
  page,
}) => {
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".stop-photo").first()).toBeVisible();
  const original = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  const count = original.stops.length;
  await expect(page.locator(".stop-photo")).toHaveCount(count);
  await page
    .getByLabel("search ur stops", { exact: true })
    .fill(original.stops[0].name);
  await expect(page.locator(".stop-card")).toHaveCount(1);
  await expect(page.locator(".sheet-count")).toHaveText(`1 of ${count} stops`);
  await page
    .getByLabel("search ur stops", { exact: true })
    .fill("no venue like this anywhere");
  await expect(
    page.getByRole("heading", { name: "no stops match that one." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "show all stops", exact: true }).tap();
  await expect(page.locator(".stop-card")).toHaveCount(count);
  await page.getByRole("button", { name: "filter stops", exact: true }).tap();
  await page
    .getByLabel("show me", { exact: true })
    .selectOption(original.stops[1].category);
  await expect(page.locator(".stop-card")).toHaveCount(
    original.stops.filter((s) => s.category === original.stops[1].category)
      .length,
  );
  await page.getByLabel("show me", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "filter stops", exact: true }).tap();
  const card = page.locator(".stop-card").nth(1);
  await card
    .getByRole("button", {
      name: `show ${original.stops[1].name} on map`,
      exact: true,
    })
    .tap();
  await expect(
    card.getByRole("button", {
      name: `show ${original.stops[1].name} on map`,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".map-preview .route-pin.is-selected")).toHaveCount(
    1,
  );
  await page.locator(".map-preview .route-pin").first().tap();
  await expect(
    page
      .locator(".stop-card")
      .first()
      .getByRole("button", {
        name: `show ${original.stops[0].name} on map`,
        exact: true,
      }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "stop order", exact: true }).tap();
  await expect(page.locator("#map-stop-legend li")).toHaveCount(count);
  await page.locator("#map-stop-legend button").last().tap();
  await expect(
    page
      .locator(".stop-card")
      .last()
      .getByRole("button", {
        name: `show ${original.stops.at(-1).name} on map`,
        exact: true,
      }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("link", { name: "ur day", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const current = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(current.id).toBe(original.id);
  expect(current.stops.map((s) => s.id)).toEqual(
    original.stops.map((s) => s.id),
  );
  expect(current.cost).toBe(original.cost);
});
