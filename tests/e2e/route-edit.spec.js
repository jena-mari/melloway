import { test, expect } from "@playwright/test";
import { venues } from "../../src/data/venues.js";
import { curatedVenuesForDate } from "../../src/data/sydneyVenues.js";
import { defaultDraft } from "../../src/data/preferences.js";
import { schedule, demoMatrix } from "../../src/utils/planner.js";
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
  const prefs = { ...defaultDraft(), area: "Newtown", date: "2026-10-18" };
  const stops = [
    "sydney-maeda",
    "sydney-uturn-vintage",
    "sydney-better-read",
  ].map((id) => curatedVenuesForDate(prefs.date).find((v) => v.id === id));
  const plan = {
    ...schedule(stops, prefs, demoMatrix(stops, prefs.transport), [0, 1, 2]),
    prefs,
    id: "real-newtown-fixture",
    notice: "Sourced venues; estimated costs and map positions.",
  };
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

test("map marker previews show the matching place on hover, keyboard focus and phone taps", async ({ page }, info) => {
  await page.goto("/explore");
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  const before = await storedPlan(page);
  const map = page.locator(".suggestion-map");
  await expect(map.locator('[data-map-state="ready"]')).toBeVisible();
  const pin = map.getByRole("button", { name: "show suggested spot Mapo Newtown", exact: true });
  await pin.hover();
  const preview = map.getByRole("complementary", { name: "Place preview" });
  await expect(preview).toContainText("Mapo Newtown");
  await expect(preview).toContainText("~$10 each");
  await preview.hover();
  await expect(preview.getByRole("button", { name: "see the vibe" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("map-place-preview-390.png") });
  await preview.getByRole("button", { name: "close place preview" }).click();
  await expect(preview).toHaveCount(0);
  await pin.focus();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await pin.tap();
  await expect(preview).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await preview.getByRole("button", { name: "see the vibe" }).tap();
  await expect(page.getByRole("dialog", { name: "Mapo Newtown", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "at this spot" })).toBeVisible();
  expect((await storedPlan(page)).stops).toEqual(before.stops);
});

test("swiping suggested spots follows their locations without changing the day", async ({ page }, info) => {
  await page.goto("/explore");
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  const initial = await storedPlan(page);
  const feed = page.getByRole("list", { name: "Nearby spot suggestions" });
  await expect(feed).toBeVisible();
  const cards = feed.locator(":scope > li");
  expect(await cards.count()).toBeGreaterThan(6);
  const firstId = await cards.nth(0).getAttribute("data-venue-id");
  const secondId = await cards.nth(1).getAttribute("data-venue-id");
  const map = page.locator(".suggestion-map[data-active-venue]");
  await expect(map).toHaveAttribute("data-active-venue", firstId);
  await feed.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = await feed.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2, y = box.y + box.height * 0.85;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 24 }] });
    await page.waitForTimeout(20);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(map).toHaveAttribute("data-active-venue", secondId);
  const venue = curatedVenuesForDate(initial.prefs.date).find((item) => item.id === secondId);
  await expect(map).toHaveAttribute("data-lat", String(venue.lat));
  await expect(map).toHaveAttribute("data-lng", String(venue.lng));
  await expect(cards.nth(1).locator(".suggestion-address")).toHaveText(venue.address);
  await expect(map.getByRole("region", { name: `Location of ${venue.name}`, exact: true })).toBeVisible();
  await expect(map.locator(".suggestion-pin.is-selected")).toHaveCount(1);
  expect((await storedPlan(page)).stops).toEqual(initial.stops);
  await page.getByRole("button", { name: "Previous suggested spot", exact: true }).tap();
  await expect(map).toHaveAttribute("data-active-venue", firstId);
  await feed.focus();
  await page.keyboard.press("ArrowDown");
  await expect(map).toHaveAttribute("data-active-venue", secondId);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".route-extras").evaluate((el) => {
    const header = document.querySelector(".app-topbar").getBoundingClientRect().height;
    window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - header - 12, behavior: "instant" });
  });
  await page.screenshot({ path: info.outputPath("suggested-spots.png") });
});

test("suggested spots remain browsable when Google Maps cannot load", async ({ page }) => {
  await page.route("https://maps.googleapis.com/maps/api/js**", route => route.abort());
  await page.goto("/explore");
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  const initial = await storedPlan(page);
  const feed = page.getByRole("list", { name: "Nearby spot suggestions" });
  await expect(feed).toBeVisible();
  await expect(page.locator(".suggestion-map-status")).toHaveText("Google Maps unavailable · address below");
  await page.getByRole("button", { name: "Next suggested spot", exact: true }).tap();
  const card = feed.locator('li[aria-current="true"]');
  const name = await card.locator("h3").innerText();
  await expect(card.locator(".suggestion-address")).not.toBeEmpty();
  await card.getByRole("button", { name: `view ${name} details`, exact: true }).tap();
  await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
  expect((await storedPlan(page)).stops).toEqual(initial.stops);
});

test("compact route rows lead into the map and suggestion previews remain opt-in", async ({
  page,
}) => {
  await page.goto("/itinerary");
  const initial = await storedPlan(page);
  await expect(page.locator(".route-extras")).toHaveCount(0);
  await expect(page.locator(".route-summary-spot span")).toHaveText(
    initial.stops.map((stop) => stop.address),
  );
  await expect(page.locator(".stop-card").first()).not.toBeVisible();
  await expect(page.locator(".route-summary-meta p")).not.toBeVisible();
  const arrow = page.getByRole("button", {
    name: `open ${initial.stops[0].name} details`,
    exact: true,
  });
  await arrow.tap();
  await expect(
    page.getByRole("dialog", { name: initial.stops[0].name, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(arrow).toBeFocused();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("#result-plan-options")).not.toBeVisible();
    await page
      .locator(".result-sheet")
      .screenshot({ path: `/private/tmp/melloway-plan-actions-${width}.png` });
    const map = await page.locator(".map-preview").boundingBox();
    const rows = await page.locator(".route-summary-list").boundingBox();
    const suggestions = await page.locator(".itinerary-explore-link").boundingBox();
    expect(rows.y + rows.height).toBeLessThan(map.y);
    expect(map.y + map.height).toBeLessThan(suggestions.y);
    expect(map.y + map.height).toBeLessThan(740);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `/private/tmp/melloway-route-layout-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const more = page.getByRole("button", {
    name: "more plan options",
    exact: true,
  });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-plan-options")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "tweak the details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "start a new plan", exact: true }),
  ).toBeVisible();
  await page.locator(".plan-disclosure summary").tap();
  await expect(page.locator(".plan-disclosure p")).toContainText(
    "Sourced venues",
  );
  await page
    .locator(".result-sheet")
    .screenshot({ path: "/private/tmp/melloway-plan-options-390.png" });
  await more.tap();
  await expect(page.locator("#result-plan-options")).not.toBeVisible();
  await page.getByRole("link", { name: "explore more spots", exact: true }).click();
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  const preview = page.getByRole("button", {
    name: "preview Mapo Newtown",
    exact: true,
  });
  await preview.tap();
  const dialog = page.getByRole("dialog", {
    name: "Mapo Newtown",
    exact: true,
  });
  await expect(dialog).toContainText("suggested spot");
  await expect(dialog).not.toContainText("NaN");
  expect((await storedPlan(page)).stops).toEqual(initial.stops);
  await page.keyboard.press("Escape");
  await expect(preview).toBeFocused();
  await preview.tap();
  await dialog.getByRole("button", { name: "add to route", exact: true }).tap();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".route-summary-list li")).toHaveCount(4);
  const next = await storedPlan(page);
  expect(next.stops.filter((stop) => stop.id === "sydney-mapo")).toHaveLength(
    1,
  );
  expect(next.cost).toBeLessThanOrEqual(next.prefs.budget);
  expect(next.elapsed).toBeLessThanOrEqual(next.prefs.duration * 60);
});

test("place names replace legacy nicknames across current, saved and shared routes", async ({
  page,
}) => {
  const stops = ["newtown-0", "newtown-1", "newtown-4"].map((id) =>
    venues.find((v) => v.id === id),
  );
  const prefs = { ...defaultDraft(), area: "Newtown" };
  const matrix = demoMatrix(stops, prefs.transport);
  const result = schedule(stops, prefs, matrix, [0, 1, 2]);
  const oldPlan = {
    ...result,
    id: "old-names",
    prefs,
    notice: "Sample route",
    stops: result.stops.map((s) => ({ ...s, name: s.legacyName })),
  };
  await page.addInitScript(
    ({ plan, candidates, matrix }) => {
      if (sessionStorage.getItem("name-fixture")) return;
      sessionStorage.setItem("name-fixture", "ready");
      localStorage.setItem(
        "melloway.current",
        JSON.stringify({ plan, candidates, matrix }),
      );
      localStorage.setItem("melloway.saved", JSON.stringify([plan]));
      localStorage.setItem(
        "melloway.posts",
        JSON.stringify([
          {
            id: "old-post",
            name: "our saved route",
            author: "Jena",
            handle: "jena",
            description: "A day in Newtown.",
            area: "Newtown",
            plan,
          },
        ]),
      );
    },
    { plan: oldPlan, candidates: oldPlan.stops, matrix },
  );
  await page.goto("/itinerary");
  const names = stops.map((s) => s.name);
  await expect(page.locator(".stop-body h2")).toHaveText(names);
  await expect(page.locator(".route-summary-spot strong")).toHaveText(names);
  const current = await storedPlan(page);
  expect(current.cost).toBe(oldPlan.cost);
  expect(current.stops.map((s) => [s.id, s.lat, s.lng, s.arrival])).toEqual(
    oldPlan.stops.map((s) => [s.id, s.lat, s.lng, s.arrival]),
  );
  await page.goto("/explore");
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  await expect(page.locator(".route-extras")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    await page.locator(".route-extras h3").allTextContents(),
  ).not.toContain("a photobooth moment");
  expect(
    await page.locator(".route-extras h3").allTextContents(),
  ).not.toContain("Sample photobooth");
  await page.goto("/favourites");
  await page.getByRole("button", { name: "open plan", exact: true }).click();
  await expect(page.locator(".stop-body h2")).toHaveText(names);
  await page.goto("/community");
  await expect(
    page
      .locator(".community-post")
      .first()
      .locator(".community-stop-photo strong"),
  ).toHaveText(names);
  await page
    .locator(".community-post")
    .first()
    .getByRole("link", { name: "check full route here", exact: true })
    .click();
  await expect(page.locator(".community-place-info strong")).toHaveText(names);
});

test("editable summary updates order, totals, map and directions; extras stay opt-in and persist", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/itinerary");
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  const initial = await storedPlan(page);
  await expect(page.getByRole("button", { name: "add a stop", exact: true })).toBeEnabled();
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
  await page.getByRole("button", { name: "add a stop", exact: true }).tap();
  await page.getByLabel("search available spots").fill("Mapo");
  await page.getByRole("button", { name: "add Mapo Newtown", exact: true }).tap();
  await expect(page.locator(".route-summary-list li")).toHaveCount(3);
  await expect(page.locator(".stop-card")).toHaveCount(3);
  const added = await storedPlan(page);
  expect(added.cost).toBe(removed.cost + 10);
  expect(
    added.stops.filter((s) => s.id !== "sydney-mapo").map((s) => s.id),
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
  for (const stop of added.stops.slice(1)) {
    const edit = page.getByRole("button", { name: "edit", exact: true });
    if (await edit.isVisible()) await edit.tap();
    await page
      .getByRole("button", {
        name: `remove ${stop.name} from route`,
        exact: true,
      })
      .tap();
  }
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
  const picker = page.getByRole("dialog", { name: "change stop" });
  await expect(picker).toBeVisible();
  await picker.getByLabel("search available spots").fill("Mapo");
  await page.screenshot({ path: info.outputPath("stop-picker-390.png") });
  await picker
    .getByRole("button", { name: "choose Mapo Newtown", exact: true })
    .tap();
  await expect(picker).not.toBeVisible();
  await expect
    .poll(async () => (await storedPlan(page)).stops[1].name)
    .toBe("Mapo Newtown");
  const after = await storedPlan(page);
  expect(after.stops[0].id).toBe(before.stops[0].id);
  expect(after.stops[2].id).toBe(before.stops[2].id);
  await page.getByRole("button", { name: "done", exact: true }).tap();
  const spot = page.getByRole("button", {
    name: "view Mapo Newtown details",
    exact: true,
  });
  await spot.tap();
  const details = page.getByRole("dialog", {
    name: "Mapo Newtown",
    exact: true,
  });
  await expect(details).toBeVisible();
  await expect(details).toContainText("20 min visit");
  await expect(details).toContainText("approximate map position");
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
  await page.goto("/explore");
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  const before = await storedPlan(page);
  await expect(page.locator(".route-extras")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(
    page.getByRole("button", {
      name: "add Mapo Newtown to route",
      exact: true,
    }),
  ).toBeDisabled();
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "edit", exact: true }).tap();
  await page.getByRole("button", { name: "add a stop", exact: true }).tap();
  await page.getByLabel("search available spots").fill("Mapo");
  await expect(
    page.getByRole("button", { name: "add Mapo Newtown", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect((await storedPlan(page)).stops).toEqual(before.stops);
  await expect(page.locator(".route-summary-total")).toContainText(
    `~$${before.cost} each`,
  );
});
