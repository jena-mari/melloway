import { test, expect } from "@playwright/test";
import {
  mockMapTiles,
  mockLocationSearch,
  continueQuestions,
  chooseTime,
  chooseArea,
} from "./fixtures.js";
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await mockLocationSearch(page);
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
  await expect(page.locator(".floating-doodle")).toHaveCount(6);
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
test("name, age and gender arrive separately and keep their answers", async ({
  page,
}, info) => {
  await page.goto("/plan/profile");
  await page.getByLabel("what’s ur name?").fill("Jena");
  await expect(page.getByLabel("age", { exact: true })).toHaveCount(0);
  await continueQuestions(page);
  await expect(page).toHaveURL(/\/plan\/about$/);
  await expect(
    page.getByRole("heading", { name: /cool name,.*Jena/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "non-binary", exact: true }),
  ).toHaveCount(0);
  const age = page.getByLabel("age", { exact: true });
  await expect(age).toHaveAttribute("type", "number");
  expect((await age.boundingBox()).width).toBeGreaterThanOrEqual(240);
  await age.fill("17");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter a whole age between 18 and 100.",
  );
  await age.fill("");
  await expect(age).toHaveValue("");
  await age.fill("27");
  await continueQuestions(page);
  await expect(page.getByLabel("age", { exact: true })).toHaveCount(0);
  const gender = page.getByRole("button", { name: "non-binary", exact: true });
  await gender.click();
  await page.reload();
  await expect(gender).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.getByLabel("age", { exact: true })).toHaveValue("27");
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
test("hanging out asks one thing at a time with optional extra details", async ({
  page,
}, info) => {
  await page.goto("/plan/details");
  await expect(page.getByLabel("any specific location in mind?")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "a friend", exact: true }).click();
  await continueQuestions(page);
  await page.getByRole("button", { name: "just friends", exact: true }).click();
  await continueQuestions(page);
  await chooseArea(page, "Newtown");
  await expect(page.getByLabel("budget each", { exact: true })).toHaveCount(0);
  await continueQuestions(page);
  const budget = page.getByLabel("budget each", { exact: true });
  await expect(budget).toHaveAttribute("type", "number");
  await expect(budget).toHaveAttribute("inputmode", "decimal");
  await budget.fill("");
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(/\$0 to \$200 AUD/);
  await budget.fill("201");
  await page.getByRole("button", { name: /a few more details/ }).click();
  await expect(page.getByRole("alert")).toHaveText(/\$0 to \$200 AUD/);
  await page.getByRole("button", { name: "free", exact: true }).click();
  await expect(budget).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "free", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await budget.fill("85.50");
  await page.getByRole("button", { name: /a few more details/ }).click();
  await page.getByLabel("their name (optional)").fill("Alex");
  await expect(page.getByLabel("hour", { exact: true })).toHaveCount(0);
  await continueQuestions(page, 2);
  await chooseTime(page, "12:00");
  await continueQuestions(page);
  await page
    .getByRole("button", { name: "Public transport", exact: true })
    .click();
  await continueQuestions(page);
  await page.getByLabel("how long have we got?").selectOption("6");
  await page.reload();
  await expect(page.getByLabel("how long have we got?")).toHaveValue("6");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Public transport", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.getByLabel("hour", { exact: true })).toHaveValue("12");
  await page.goto("/plan/details?q=2");
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Newtown",
  );
  await continueQuestions(page);
  await expect(page.getByLabel("budget each", { exact: true })).toHaveValue(
    "85.5",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("hanging-out.png") });
  await continueQuestions(page);
  await expect(page).toHaveURL(/\/plan\/vibes$/);
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("melloway.draft")),
  );
  expect(draft.companion).toBe("a friend");
  expect(draft.occasion).toBe("just friends");
  expect(draft.partner).toBe("Alex");
  expect(draft.duration).toBe(6);
});
test("illustrated ideas can be browsed and preferences still support multi-select", async ({
  page,
}, info) => {
  await page.goto("/plan/vibes");
  await expect(page.locator(".idea-dots button")).toHaveCount(5);
  await expect(page.locator(".idea-caption")).toHaveText(
    "high energy outdoor activities",
  );
  await page.getByRole("button", { name: "Next idea", exact: true }).click();
  await expect(page.locator(".idea-caption")).toHaveText(
    "indie bookshops and art museums",
  );
  await page
    .getByRole("button", { name: "Previous idea", exact: true })
    .click();
  await expect(page.locator(".idea-caption")).toHaveText(
    "high energy outdoor activities",
  );
  await page
    .getByRole("button", { name: "sleek wine bar and smart-casual dinner", exact: true })
    .click();
  await expect(page.locator(".idea-caption")).toHaveText(
    "sleek wine bar and smart-casual dinner",
  );
  for (const title of [
    "homebody and cozy",
    "live music and dynamic environments",
    "high energy outdoor activities",
  ]) {
    await page.getByRole("button", { name: "Next idea", exact: true }).click();
    await expect(page.locator(".idea-caption")).toHaveText(title);
    await expect.poll(() => page.locator(".date-illustration").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await page.getByRole("button", { name: "sleek wine bar and smart-casual dinner", exact: true }).click();
  await expect(page.locator(".idea-caption")).toHaveText("sleek wine bar and smart-casual dinner");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("melloway.draft")).ideaExplicit)).toBe(true);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("date-idea.png") });
  await page.getByRole("button", { name: /make it more ur vibe/ }).click();
  const coffee = page.getByRole("button", {
    name: "Coffee shops",
    exact: true,
  });
  const museums = page.getByRole("button", { name: "Museums", exact: true });
  await coffee.click();
  await continueQuestions(page);
  await museums.click();
  await page.reload();
  await expect(museums).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(coffee).toHaveAttribute("aria-pressed", "true");
  await continueQuestions(page);
  await expect(museums).toHaveAttribute("aria-pressed", "true");
  await continueQuestions(page, 3);
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
    "indie bookshops and art museums",
  );
  await expect(page).toHaveURL(/\/plan\/vibes$/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next idea", exact: true }).tap();
  await expect(page.locator(".idea-caption")).toHaveText(
    "sleek wine bar and smart-casual dinner",
  );
});
test("results show the route summary, expandable map and spot sheets while swaps preserve other cards", async ({
  page,
}, info) => {
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".route-summary-heading h2")).toBeVisible();
  await expect(page.locator(".inline-stop-expansion").first()).not.toBeVisible();
  const summary = await page.locator(".result-sheet").boundingBox();
  const map = await page.locator(".route-map").boundingBox();
  expect(summary.y).toBeGreaterThanOrEqual(map.y + map.height - 5);
  const routeSummary = await page.locator(".route-summary").boundingBox();
  expect(routeSummary.y + routeSummary.height).toBeLessThanOrEqual(map.y + 1);
  await expect(page.locator(".inline-stop-expansion")).toHaveCount(0);
  await expect(page.locator(".map-preview .route-pin").first()).toBeVisible();
  const count = await page.locator(".route-summary-list > li").count();
  const numbers = (
    await page.locator(".map-preview .pin-numbers").allTextContents()
  )
    .flatMap((s) => s.split(" · "))
    .sort();
  expect(numbers).toEqual(Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)));
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
  const canvas = dialog.locator(".google-map-surface");
  const zoom = Number(await canvas.getAttribute("data-map-zoom"));
  await dialog.getByRole("button", { name: "Zoom in" }).tap();
  await expect.poll(async () => Number(await canvas.getAttribute("data-map-zoom"))).toBeGreaterThan(zoom);
  expect(new URL(await dialog.getByRole("link", { name: "get directions" }).getAttribute("href")).searchParams.get("travelmode")).toBeNull();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(expand).toBeFocused();
  const details = page.locator('.route-summary-spot');
  await details.first().tap();
  await expect(details.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.inline-stop-details')).toBeVisible();
  await expect(page.locator('.spot-detail-dialog')).toHaveCount(0);
  await details.first().tap();
  await expect(details.first()).toHaveAttribute('aria-expanded', 'false');
  const before = await page.locator('.route-summary-spot strong').allTextContents();
  await page.locator('.route-summary-list > li').first().evaluate(el => { window.unchangedStop = el; });
  await page.getByRole('button', { name: `regenerate ${before[1]}`, exact: true }).tap();
  await expect(page.locator('.route-summary-spot strong').nth(1)).not.toHaveText(before[1]);
  expect(await page.locator('.route-summary-list > li').first().evaluate(el => el === window.unchangedStop)).toBe(true);
  expect((await page.locator('.route-summary-spot strong').allTextContents()).filter((_, i) => i !== 1)).toEqual(before.filter((_, i) => i !== 1));
  await details.first().tap();
  await details.nth(1).tap();
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(1);
  await expect(details.first()).toHaveAttribute('aria-expanded', 'false');
  await details.nth(1).tap();
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
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

test("unavailable Google Maps leaves the plan, details and save action usable", async ({
  page,
}) => {
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.abort(),
  );
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".route-map .google-map-error [role='status']")).toHaveText(
    "Google Maps unavailable.",
  );
  await page.locator('.route-summary-spot').first().tap();
  await expect(page.locator('.inline-stop-photo').first()).toBeVisible();
  await expect(page.locator('.inline-stop-details')).toBeVisible();
  await expect(page.locator('.spot-detail-dialog')).toHaveCount(0);
  await page.locator('.route-summary-spot').first().tap();
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
  await page.route("**/api/itinerary-map?*", (route) => route.fulfill({
    contentType: "text/html",
    body: "<p>Google pin map test fixture</p><script>window.parent.postMessage({type:'melloway-map-ready'}, '*')</script>",
  }));
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
      /google.com\/maps\/embed\/v1\/directions|\/api\/itinerary-map\?stops=/,
    );
  } else {
    await expect(
      page.getByRole("link", { name: "see the route", exact: true }),
    ).toHaveAttribute("href", /waypoints=/);
  }

  await page.getByRole("button", { name: "expand map", exact: true }).tap();
  await expect(page.getByRole("dialog").locator("ol li")).toHaveCount(
    await page.locator(".route-summary-list > li").count(),
  );
  await page.getByRole("button", { name: "close map", exact: true }).tap();
  expect(new URL(await page.getByRole("link", { name: "open Google Maps" }).getAttribute("href")).searchParams.get("travelmode")).toBeNull();
});

test("local Maple Shore and Outfit fonts finish loading", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await document.fonts.load('48px "Maple Shore"');
    await document.fonts.load('16px "Outfit"');
    await document.fonts.ready;
  });
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
    "what’s ur name?",
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
    "what’s ur name?",
  );
  await expect(prompts.locator(".typing-caret")).toHaveCount(0);
  await expect(page.getByLabel("what’s ur name?")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("incomplete discovery recovers with sourced venues without repeating the introduction", async ({
  page,
}) => {
  let interrupted = true;
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: interrupted ? "google" : "demo" } }),
  );
  await page.route("**/api/venues", async (route) => {
    // Incomplete provider facts must not replace the usable sourced catalog.
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
  await page.addInitScript(() =>
    localStorage.setItem(
      "melloway.draft",
      JSON.stringify({
        area: "Newtown",
        date: "2026-10-18",
        notes: "we love matcha and vintage finds",
      }),
    ),
  );
  await page.goto("/plan/notes");
  await page
    .getByLabel("anything else for ur plan?")
    .fill("we love matcha and vintage finds");
  await page.getByRole("button", { name: "submit", exact: true }).tap();
  await expect(page).toHaveURL(/\/itinerary$/);
  const plan = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  expect(plan.stops.every((v) => v.source === "curated")).toBe(true);
  expect(plan.notice).toContain("Discovery unavailable");
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
  const original = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan,
  );
  const count = original.stops.length;
  await expect(page.locator(".route-summary-list > li")).toHaveCount(count);
  await expect(page.getByLabel("search ur stops", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Search stops", exact: true }).tap();
  await expect(page.getByLabel("search ur stops", { exact: true })).toBeFocused();
  await page
    .getByLabel("search ur stops", { exact: true })
    .fill(original.stops[0].name);
  await expect(page.locator(".route-summary-list > li")).toHaveCount(1);
  await expect(page.locator(".route-summary-spot")).toHaveCount(1);
  await page
    .getByLabel("search ur stops", { exact: true })
    .fill("no venue like this anywhere");
  await expect(
    page.getByRole("heading", { name: "no stops match that one." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "show all stops", exact: true }).tap();
  await expect(page.locator(".route-summary-list > li")).toHaveCount(count);
  await page.getByRole("button", { name: "Search stops", exact: true }).tap();
  await expect(page.getByLabel("search ur stops", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Search stops", exact: true }).tap();
  await page.getByRole("button", { name: "filter stops", exact: true }).tap();
  await page
    .getByLabel("show me", { exact: true })
    .selectOption(original.stops[1].category);
  await expect(page.locator(".route-summary-list > li")).toHaveCount(
    original.stops.filter((s) => s.category === original.stops[1].category)
      .length,
  );
  await page.getByLabel("show me", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "filter stops", exact: true }).tap();
  await page.locator('.route-summary-spot').nth(1).tap();
  await expect(page.locator('.route-summary-spot').nth(1)).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.map-preview .route-pin.is-selected')).toHaveCount(1);
  await page.locator('.map-preview .route-pin').first().tap();
  await expect(page.getByRole('region', {name:`${original.stops[0].name} stop details`, exact:true})).toBeVisible();
  await expect(page.locator('.route-summary-spot').first()).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.map-preview .pin-numbers span:not([hidden])')).toHaveCount(count);
  await page.locator('.route-summary-spot').last().tap();
  await expect(page.getByRole('region', {name:`${original.stops.at(-1).name} stop details`,exact:true})).toBeVisible();
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(1);
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

test("calendar supports month navigation and keyboard selection; time remains optional", async ({
  page,
}) => {
  await page.goto("/plan/details?q=5");
  await expect(page.locator(".question-turn")).toBeFocused();
  const today = await page
    .locator('[aria-current="date"]')
    .getAttribute("aria-label");
  await expect(
    page.getByRole("button", { name: "previous month", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "next month", exact: true }).click();
  const heading = await page.locator(".calendar-heading p").textContent();
  await page
    .locator(".date-calendar td button:not([disabled])")
    .first()
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".date-calendar td button").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  const selected = page.locator(
    '.date-calendar td button[aria-pressed="true"]',
  );
  await expect(selected).toHaveText("2");
  await page.reload();
  await expect(page.locator(".calendar-heading p")).toHaveText(heading);
  await expect(selected).toHaveText("2");
  await page.getByRole("button", { name: "today", exact: true }).click();
  await expect(selected).toHaveAttribute("aria-label", today);
  await page.getByRole("button", { name: "not sure yet", exact: true }).click();
  await expect(selected).toHaveCount(0);
  await continueQuestions(page);
  await expect(
    page.getByRole("table", { name: "the day", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "evening 6 pm", exact: true }).click();
  await expect(page.getByLabel("hour", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("am or pm", { exact: true })).toHaveValue("pm");
  await chooseTime(page, "00:30");
  await expect(page.locator(".schedule-selection")).toHaveText(
    "starting around 12:30 am",
  );
  await chooseTime(page, "12:00");
  await expect(page.locator(".schedule-selection")).toHaveText(
    "starting around 12:00 pm",
  );
  await page.getByRole("button", { name: "not sure yet", exact: true }).click();
  await continueQuestions(page);
  await expect(
    page.getByRole("button", { name: "Walking", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel("hour", { exact: true })).toHaveValue("");
  await expect(page.locator(".question-turn")).toBeFocused();
});

test("skipping calendar and time preserves other answers and generates with defaults", async ({
  page,
}) => {
  await page.goto("/plan/profile");
  await page.getByLabel("what’s ur name?").fill("Jena");
  await page.goto("/plan/details?q=5");
  await page.getByRole("button", { name: "today", exact: true }).click();
  const today = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.draft")).date,
  );
  await page.getByRole("button", { name: "tomorrow", exact: true }).click();
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await chooseTime(page, "23:30");
  await page
    .getByRole("button", { name: "lemme skip this +", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Walking", exact: true }),
  ).toBeVisible();
  await page.reload();
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("melloway.draft")),
  );
  expect(draft.name).toBe("Jena");
  expect(draft.date).toBe("");
  expect(draft.time).toBe("");
  await continueQuestions(page, 5);
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".route-summary-spot").first()).toBeVisible();
  const prefs = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan.prefs,
  );
  expect(prefs.name).toBe("Jena");
  expect(prefs.date).toBe(today);
  expect(prefs.time).toBe("11:00");
});

test("Sydney location search selects resolved geometry, persists and supports keyboard suggestions", async ({
  page,
}) => {
  let token;
  await page.route("**/api/locations/search", (route) => {
    const body = route.request().postDataJSON();
    token = body.sessionToken;
    return route.fulfill({
      json: {
        source: "google",
        suggestions: [
          {
            id: "test-spot",
            name: "A Sydney spot",
            address: "Newtown NSW",
            source: "google",
          },
        ],
      },
    });
  });
  await page.route("**/api/locations/resolve", (route) => {
    expect(route.request().postDataJSON().sessionToken).toBe(token);
    return route.fulfill({
      json: {
        location: {
          id: "test-spot",
          name: "A Sydney spot",
          address: "Newtown NSW",
          lat: -33.8965,
          lng: 151.1794,
          r: 3,
          source: "google",
        },
      },
    });
  });
  await page.goto("/plan/details?q=2");
  const search = page.getByRole("combobox", {
    name: "any specific location in mind?",
  });
  await search.fill("newtown");
  await expect(
    page.getByRole("option", { name: /A Sydney spot/ }),
  ).toBeVisible();
  await expect(page.locator(".google-search-attribution")).toHaveText(
    "Google Maps",
  );
  await search.press("Enter");
  await expect(search).toHaveValue("A Sydney spot");
  await continueQuestions(page);
  await expect(page.getByLabel("budget each", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(search).toHaveValue("A Sydney spot");
  await page.goto("/plan/notes");
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".route-summary-spot").first()).toBeVisible();
  const prefs = await page.evaluate(
    () => JSON.parse(localStorage.getItem("melloway.current")).plan.prefs,
  );
  expect(prefs.area).toBe("A Sydney spot");
  expect(prefs.location.lat).toBe(-33.8965);
});

test("location editing cancels pending selection and failed selection can retry", async ({
  page,
}) => {
  const calls = [];
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/locations/search", (route) => {
    const { query } = route.request().postDataJSON();
    return route.fulfill({
      json: {
        source: "google",
        suggestions: [
          {
            id: query.replaceAll(" ", "-"),
            name: query,
            address: "Sydney NSW",
            source: "google",
          },
        ],
      },
    });
  });
  let attempts = 0;
  await page.route("**/api/locations/resolve", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.placeId === "old-spot") {
      await held;
      await route
        .fulfill({ status: 502, json: { error: "Unavailable" } })
        .catch(() => {});
      return;
    }
    if (++attempts === 1)
      return route.fulfill({ status: 502, json: { error: "Unavailable" } });
    return route.fulfill({
      json: {
        location: {
          id: "new-spot",
          name: "New spot",
          address: "Newtown NSW",
          lat: -33.8965,
          lng: 151.1794,
          r: 3,
          source: "google",
        },
      },
    });
  });
  await page.goto("/plan/details?q=2");
  const search = page.getByLabel("any specific location in mind?");
  await search.fill("old spot");
  await expect(page.getByRole("option", { name: /old spot/ })).toBeVisible();
  await search.press("Enter");
  await expect.poll(() => calls.length).toBe(1);
  await search.fill("new spot");
  await expect(page.getByRole("option", { name: /new spot/ })).toBeVisible();
  release();
  await search.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(/couldn’t select/);
  await search.press("Enter");
  await expect(search).toHaveValue("New spot");
  expect(calls[1].sessionToken).not.toBe(calls[0].sessionToken);
  expect(calls[2].sessionToken).toMatch(/^[a-zA-Z0-9_-]{1,36}$/);
  await continueQuestions(page);
  await expect(page.getByLabel("budget each", { exact: true })).toBeVisible();
});

test("unmatched location text never silently uses the previous location", async ({
  page,
}) => {
  await page.goto("/plan/details?q=2");
  const search = page.getByLabel("any specific location in mind?");
  await search.fill("nothing like this nearby");
  await expect(page.locator(".location-search-status")).toHaveText(
    /no matches/,
  );
  await page.getByRole("button", { name: "continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(/Choose a suggestion/);
  await page
    .getByRole("button", { name: "anywhere in Sydney is good", exact: true })
    .click();
  await continueQuestions(page);
  await expect(page.getByLabel("budget each", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("melloway.draft")).area,
    ),
  ).toBe("Anywhere in Sydney");
});
