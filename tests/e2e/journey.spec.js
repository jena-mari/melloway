import { test, expect } from "@playwright/test";
import {
  mockMapTiles,
  mockLocationSearch,
  continueQuestions,
  chooseTime,
  chooseArea,
} from "./fixtures.js";
const nameInput = (page) => page.getByLabel("what’s ur name?");
async function openStops(page) {
  await expect(page.locator('.route-summary-spot strong').first()).toBeVisible();
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
  await continueQuestions(page, 5);
  await chooseArea(page, "Newtown");
  await continueQuestions(page);
  await page.getByRole("button", { name: /a few more details/ }).click();
  await page.getByLabel("their name (optional)").fill("Alex");
  await continueQuestions(page, 2);
  await chooseTime(page, "11:00");
  await continueQuestions(page, 3);
  await page.getByRole("button", { name: /make it more ur vibe/ }).click();
  await page.getByRole("button", { name: "Matcha cafés", exact: true }).click();
  await page.getByRole("button", { name: "Thrifting", exact: true }).click();
  await continueQuestions(page, 4);
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await openStops(page);
}
async function swapOnly(page, index) {
  await openStops(page);
  await expect(page.locator(".route-summary-spot strong").nth(index)).toBeVisible();
  const before = await page.locator(".route-summary-spot strong").allTextContents();
  await page.getByRole('button', {name:`regenerate ${before[index]}`,exact:true}).click();
  await expect(page.locator(".route-summary-spot strong").nth(index)).not.toHaveText(
    before[index],
  );
  const after = await page.locator(".route-summary-spot strong").allTextContents();
  expect(before.filter((_, i) => i !== index)).toEqual(
    after.filter((_, i) => i !== index),
  );
}
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await mockLocationSearch(page);
  // Sourced catalog with deterministic local scoring; never charge external APIs.
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "demo" } }),
  );
});

test("plan, replace, save, reopen, replace again, and start fresh", async ({
  page,
}) => {
  test.setTimeout(60000); // Full onboarding, two replacements, persistence, and starting again.
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await planDay(page);
  const titles = await page.locator(".route-summary-spot strong").allTextContents();
  expect(titles.length).toBeGreaterThanOrEqual(3);
  expect(titles.length).toBeLessThanOrEqual(5);
  expect(new Set(titles).size).toBe(titles.length);
  await swapOnly(page, 1);
  await page.locator('.route-summary-spot').first().click();
  await expect(page.locator('.inline-stop-details')).toBeVisible();
  await page.getByRole('link', {name:'View Details',exact:true}).click();
  await expect(page.locator(".venue h1")).toHaveText(titles[0]);
  await page.getByRole("link", { name: "back to ur day" }).click();
  await page.getByRole("button", { name: "lock this in" }).click();
  await openSaved(page);
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.getByRole("button", { name: "open plan" }).click();
  await swapOnly(page, 1);
  await page
    .getByRole("button", { name: "more plan options", exact: true })
    .click();
  await page.getByRole("link", { name: "tweak the details" }).click();
  await continueQuestions(page, 2);
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Newtown",
  );
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "try another plan" }).click();
  await expect(
    page.getByRole("button", { name: "try another plan" }),
  ).toBeEnabled();
  const directions = page.getByRole("link", { name: "open Google Maps" });
  const transport = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.prefs.transport);
  const mode = new URL(await directions.getAttribute('href')).searchParams.get('travelmode');
  expect(mode).toBe(transport === 'Not selected' ? null : transport === 'Walking' ? 'walking' : transport === 'Driving' ? 'driving' : 'transit');
  await page
    .getByRole("button", { name: "more plan options", exact: true })
    .click();
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
      name: "no saved plans",
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("draft and interests persist through individual questions, back and reload", async ({
  page,
}) => {
  await page.goto("/plan/profile");
  await nameInput(page).fill("Jena");
  await continueQuestions(page, 5);
  await chooseArea(page, "Surry Hills");
  await continueQuestions(page, 2);
  await page.getByRole("button", { name: /make it more ur vibe/ }).click();
  await page.getByRole("button", { name: "Coffee shops", exact: true }).click();
  await continueQuestions(page);
  await page.getByRole("button", { name: "Museums", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Museums", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Coffee shops", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.locator(".idea-caption")).toBeVisible();
  await page.getByRole("link", { name: "back", exact: true }).click();
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.getByLabel("any specific location in mind?")).toHaveValue(
    "Surry Hills",
  );
  await page.goto("/plan/profile");
  await expect(nameInput(page)).toHaveValue("Jena");
});
test("community posts, ratings and likes persist; event filters work", async ({
  page,
}) => {
  await page.goto("/community");
  await page.getByRole("button", { name: "share a route" }).click();
  await page.getByLabel("title", { exact: true }).fill("A lovely day");
  await page
    .getByLabel("post", { exact: true })
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
  await page.getByRole("button", { name: "festivals", exact: true }).click();
  await expect(page.locator(".sydney-event-tile")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "SURPLUS 2026" })).toBeVisible();
});

test("compact community feed supports threads, saves and expanded itineraries", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/community");
  const posts = page.locator(".community-post");
  await expect(posts).toHaveCount(3);
  await expect(posts.first().locator(".community-person")).toContainText("Zoe");
  await expect(posts.first().locator(".community-person")).toContainText(
    "@zoe.takes.it.slow",
  );
  await expect(posts.first().locator(".community-stop-photo")).toHaveCount(3);
  await expect(posts.first().locator(".community-stop-photo img")).toHaveCount(
    3,
  );
  await expect
    .poll(() =>
      posts
        .first()
        .locator(".community-stop-photo img")
        .evaluateAll((images) =>
          images.every((img) => img.complete && img.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await expect(page.locator(".map-canvas")).toHaveCount(0);
  await expect(page.locator(".app-topbar")).toHaveCount(0);
  await expect(page.getByLabel("search posts")).toBeVisible();
  await expect(
    page.locator(".community-page > .community-filters"),
  ).toHaveCount(0);
  await expect(page.locator(".community-feed-header")).toHaveCount(1);
  expect((await posts.first().boundingBox()).y).toBeLessThan(100);
  expect(
    await posts
      .first()
      .evaluate((card) => getComputedStyle(card).borderTopWidth),
  ).toBe("1px");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `/private/tmp/melloway-spacious-feed-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    posts.first().locator(".community-route-line > span"),
  ).toHaveCount(0);
  const first = posts.first();
  await first
    .getByRole("button", {
      name: "Like a slow saturday in newtown",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await page.getByRole("tab", { name: "Your Likes" }).click();
  await expect(page.locator(".profile-content .community-post")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Back to community", exact: true })
    .click();
  await page.getByLabel("search posts").fill("@zoe.takes.it.slow");
  await expect(posts).toHaveCount(1);
  await page.getByLabel("search posts").fill("somewhere that does not exist");
  await expect(page.locator(".community-empty")).toContainText(
    "no posts found",
  );
  await page
    .getByRole("button", { name: "see all posts", exact: true })
    .click();
  await expect(posts).toHaveCount(3);
  await page.getByLabel("search posts").fill("Newtown");
  await page.getByRole("button", { name: "clear search", exact: true }).click();
  await expect(page.getByLabel("search posts")).toHaveValue("");
  await expect(page.getByLabel("search posts")).toBeFocused();
  await expect(posts).toHaveCount(3);
  await first
    .getByRole("button", {
      name: "Replies to a slow saturday in newtown",
      exact: true,
    })
    .click();
  await first
    .getByLabel("reply as you @you")
    .fill("is this a good route for a slow afternoon?");
  await first.getByRole("button", { name: "reply", exact: true }).click();
  await expect(first.locator(".community-thread li")).toHaveCount(1);
  await expect(first.locator(".community-thread")).toContainText(
    "is this a good route for a slow afternoon?",
  );
  await first
    .getByRole("button", {
      name: "Replies to a slow saturday in newtown",
      exact: true,
    })
    .click();
  await first
    .getByRole("button", {
      name: "Save route a slow saturday in newtown",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    first.getByRole("button", {
      name: "Unsave route a slow saturday in newtown",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    first.getByRole("button", {
      name: "Like a slow saturday in newtown",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    first.getByRole("button", {
      name: "Replies to a slow saturday in newtown",
      exact: true,
    }),
  ).toHaveText("1");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("community-feed-390.png"),
    fullPage: true,
  });
  const stopNames = await first
    .locator(".community-stop-photo strong")
    .allTextContents();
  await first
    .getByRole("link", { name: "check full route here", exact: true })
    .click();
  await expect(page).toHaveURL(/\/community\/example1$/);
  await expect(page.locator(".community-place-list li")).toHaveCount(3);
  await expect(page.locator(".route-summary-list > li")).toHaveCount(0);
  await expect(page.locator(".community-place-info strong")).toHaveText(
    stopNames,
  );
  await expect(page.locator(".map-preview .route-pin").first()).toBeVisible();
  await page.screenshot({
    path: info.outputPath("expanded-community-route-390.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: `open ${stopNames[0]} details`, exact: true })
    .click();
  await expect(page.locator(".spot-detail-dialog")).toBeVisible();
  await page.getByRole("link", { name: "location spotlight" }).click();
  await expect(page).toHaveURL(/\/community\/example1\/venue\//);
  await expect(page.locator(".venue h1")).toHaveText(stopNames[0]);
  await page.getByRole("link", { name: "back to ur day" }).click();
  await page
    .getByRole("button", { name: "make this my day", exact: true })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".route-summary-spot strong")).toHaveText(stopNames);
  await page.goto("/community");
  await page
    .getByRole("button", { name: "share a route", exact: true })
    .click();
  await page.getByLabel("display name").fill("Jena");
  await page.getByLabel("your @").fill("@jena_routes");
  await page
    .getByLabel("title", { exact: true })
    .fill("our little Newtown loop");
  await page
    .getByLabel("post", { exact: true })
    .fill("kept this one for a slow afternoon.");
  await page.getByRole("button", { name: "save to device feed" }).click();
  await expect(first.locator(".community-person")).toContainText(
    "@jena_routes",
  );
  expect(
    await first.locator(".community-stop-photo strong").allTextContents(),
  ).toEqual(stopNames);
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await page.getByRole("tab", { name: "Your Posts" }).click();
  await expect(page.locator(".profile-content .community-post")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "our little Newtown loop", exact: true }),
  ).toBeVisible();
  await expect(first.locator(".community-stop-photo")).toHaveCount(3);
  await page
    .getByRole("link", { name: "Back to community", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("community-feed-320.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("simple community route opens place details and suggested posts without replacing the current outing", async ({
  page,
}, info) => {
  await page.goto("/community/example3");
  await page
    .getByRole("button", { name: "make this my day", exact: true })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/);
  const readCurrent = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("melloway.current")));
  const original = await readCurrent();
  await page.goto("/community/example1");
  await expect(
    page.locator(".community-expanded-post .community-person"),
  ).toContainText("Zoe");
  await expect(page.locator(".community-place-list li")).toHaveCount(3);
  await expect(
    page.locator(
      ".route-summary, .result-searchbar, .stop-card, .route-extras",
    ),
  ).toHaveCount(0);
  const names = await page
    .locator(".community-place-info strong")
    .allTextContents();
  const arrow = page.getByRole("button", {
    name: `open ${names[1]} details`,
    exact: true,
  });
  await arrow.click();
  const dialog = page.getByRole("dialog", { name: names[1], exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".stop-address")).not.toBeEmpty();
  await expect(dialog).toContainText("min visit");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(arrow).toBeFocused();
  const save = page.getByRole("button", {
    name: "Save route a slow saturday in newtown",
    exact: true,
  });
  await save.click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Unsave route a slow saturday in newtown",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".community-explore-grid")).toHaveCount(0);
  await page.getByRole("link", { name: "explore more spots", exact: true }).click();
  const grid = page.locator(".community-explore-grid");
  await expect(grid.locator("a")).toHaveCount(3);
  await grid
    .getByRole("link", {
      name: "view route harbour views & happy hearts by Kai",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/community\/example2$/);
  await expect(page.locator(".community-route-title")).toContainText(
    "harbour views & happy hearts",
  );
  await expect(page.locator(".community-place-info strong").first()).toHaveText(
    "Art Gallery of NSW",
  );
  expect(await readCurrent()).toEqual(original);
  await page.goto("/community/example1?stop=kingst");
  await expect(
    page.getByRole("dialog", { name: "King Street, Newtown", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("expanded-post-320.png"),
    fullPage: true,
  });
  expect(await readCurrent()).toEqual(original);
  await page
    .getByRole("button", { name: "make this my day", exact: true })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/);
  const copied = await readCurrent();
  expect(copied.plan.id).not.toBe(original.plan.id);
  expect(copied.plan.stops.map((stop) => stop.name)).toEqual(names);
  await page.goto("/community/missing-post");
  await expect(
    page.getByRole("heading", { name: "that route has wandered off." }),
  ).toBeVisible();
});

test("organiser posters support likes, saves, details and saved-event navigation", async ({ page }, info) => {
  await page.clock.setFixedTime(new Date("2026-10-11T01:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/events");
  const tiles = page.locator(".sydney-event-tile");
  await expect(tiles).toHaveCount(3);
  await tiles.getByRole("link", { name: "View event SURPLUS 2026", exact: true }).click();
  const post = page.getByRole("article", { name: "SURPLUS 2026" });
  await expect(post).toContainText("organiser");
  await expect(post.getByRole("img", { name: "SURPLUS festival collage", exact: true })).toBeVisible();
  await post.getByRole("button", { name: "Like event SURPLUS 2026", exact: true }).click();
  await post.getByRole("button", { name: "Save event SURPLUS 2026", exact: true }).click();
  await page.reload();
  await expect(post.getByRole("button", { name: "Like event SURPLUS 2026" })).toHaveAttribute("aria-pressed", "true");
  await expect(post.getByRole("button", { name: "Unsave event SURPLUS 2026" })).toHaveAttribute("aria-pressed", "true");
  await expect(post.locator(".event-more-details")).toHaveAttribute("open", "");
  await expect(post.locator(".event-facts")).toContainText("16–18 Oct 2026");
  await expect(post.locator(".event-facts")).toContainText("Darlinghurst");
  await expect(post.getByRole("link", { name: "event details" })).toHaveAttribute("href", "https://surplus.sydney/");
  await page.getByRole("button", { name: "liked", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  await tiles.getByRole("link", { name: "View event SURPLUS 2026", exact: true }).click();
  await post.getByRole("button", { name: "Like event SURPLUS 2026", exact: true }).click();
  await page.getByRole("button", { name: "liked", exact: true }).click();
  await expect(tiles).toHaveCount(0);
  await page.getByRole("button", { name: "saved", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  await page.getByRole("link", { name: "view saved events", exact: true }).click();
  await expect(page).toHaveURL(/\/favourites\?tab=events$/);
  await expect(page.locator(".saved-event-card")).toHaveCount(1);
  await page.getByRole("link", { name: "SURPLUS 2026", exact: true }).click();
  await expect(page).toHaveURL(/\/events\?event=sydney:surplus-2026$/);
  await expect(post).toBeVisible();
  await post.getByRole("button", { name: "Unsave event SURPLUS 2026", exact: true }).click();
  await page.getByRole("button", { name: "back to all events", exact: true }).click();
  await page.getByRole("button", { name: "saved", exact: true }).click();
  await expect(tiles).toHaveCount(0);
  await page.getByRole("button", { name: "see all events", exact: true }).click();
  await page.getByLabel("search events").fill("sculpture");
  await expect(tiles).toHaveCount(1);
  await expect(tiles).toContainText("Sculpture by the Sea");
  await page.getByLabel("search events").fill("");
  await page.screenshot({ path: info.outputPath("organiser-event-feed.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("impossible hours and exclusions show a recoverable empty state", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "melloway.draft",
      JSON.stringify({ notes: "no bars" }),
    ),
  );
  await page.goto("/plan/details?q=6");
  await chooseTime(page, "23:30");
  await continueQuestions(page, 6);
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "No sourced, open places nearby fit",
  );
  await page.getByRole("link", { name: "tweak the details" }).click();
  await continueQuestions(page, 3);
  await page.getByRole("button", { name: /a few more details/ }).click();
  await continueQuestions(page, 2);
  await expect(page.getByLabel("hour", { exact: true })).toHaveValue("11");
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
      "/plan/food",
      "/plan/food?q=1",
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
