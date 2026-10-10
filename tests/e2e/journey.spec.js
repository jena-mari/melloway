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
  await page.getByRole("button", { name: "Bookshops", exact: true }).click();
  await continueQuestions(page, 3);
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
  await mockLocationSearch(page);
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
  await continueQuestions(page, 2);
  await page.getByRole("button", { name: "Museums", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Museums", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Coffee shops", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "back", exact: true }).click();
  await expect(page.locator(".idea-caption")).toBeVisible();
  await page.getByRole("link", { name: "back", exact: true }).click();
  await continueQuestions(page, 2);
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
  await expect(page.locator(".event-post")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "a weekend market wander" }),
  ).toBeVisible();
});

test("community feed maps keep identities, filters, saved routes and shared routes usable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/community");
  const posts = page.locator(".community-post");
  await expect(posts).toHaveCount(3);
  await expect(posts.first().locator(".community-person")).toContainText("Zoe");
  await expect(posts.first().locator(".community-person")).toContainText(
    "@zoe.takes.it.slow",
  );
  await expect(posts.first().locator(".community-stops li")).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await posts.nth(i).scrollIntoViewIfNeeded();
    await expect(posts.nth(i).locator(".map-canvas")).toBeVisible();
  }
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map(
      (element) => element.id,
    );
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
  expect(duplicates).toEqual([]);
  await posts
    .nth(1)
    .getByRole("button", { name: "expand map", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "harbour views & happy hearts",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    posts.nth(1).getByRole("button", { name: "expand map", exact: true }),
  ).toBeFocused();
  await posts
    .first()
    .getByRole("button", {
      name: "Like a slow saturday in newtown",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "liked", exact: true }).click();
  await expect(posts).toHaveCount(1);
  await page.getByLabel("search ideas").fill("@zoe.takes.it.slow");
  await expect(posts).toHaveCount(1);
  await page.getByLabel("search ideas").fill("somewhere that does not exist");
  await expect(
    page.getByRole("heading", { name: "no little plans found." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "see all ideas", exact: true })
    .click();
  await posts
    .first()
    .getByRole("button", {
      name: "Save route a slow saturday in newtown",
      exact: true,
    })
    .click();
  await expect(
    posts.first().getByRole("button", {
      name: "Unsave route a slow saturday in newtown",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    posts.first().getByRole("button", {
      name: "Unsave route a slow saturday in newtown",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => document.fonts.ready);
  await expect(posts.first().locator(".map-canvas")).toBeVisible();
  await expect(
    posts.first().locator(".leaflet-tile-loaded").first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("community-feed.png"),
    fullPage: true,
  });
  const stops = await posts
    .first()
    .locator(".community-stops strong")
    .allTextContents();
  await posts
    .first()
    .getByRole("button", { name: "see this route", exact: true })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".stop-card")).toHaveCount(3);
  expect(await page.locator(".stop-body h2").allTextContents()).toEqual(stops);
  await page.goto("/community");
  await page
    .getByRole("button", { name: "share a route", exact: true })
    .click();
  await page.getByLabel("display name").fill("Jena");
  await page.getByLabel("your @").fill("@jena_routes");
  await page
    .getByLabel("give it a little title")
    .fill("our little Newtown loop");
  await page
    .getByLabel("the little details")
    .fill("kept this one for a slow afternoon.");
  await page.getByRole("button", { name: "save to device feed" }).click();
  await expect(posts.first().locator(".community-person")).toContainText(
    "@jena_routes",
  );
  expect(
    await posts.first().locator(".community-stops strong").allTextContents(),
  ).toEqual(stops);
  await page.getByRole("button", { name: "your posts", exact: true }).click();
  await expect(posts).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "our little Newtown loop", exact: true }),
  ).toBeVisible();
  await expect(posts.first().locator(".community-stops li")).toHaveCount(3);
});

test("event posters support likes, saves, details and saved-event navigation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/events");
  const posts = page.locator(".event-post");
  await expect(posts).toHaveCount(5);
  await expect(
    posts.first().getByRole("img", { name: /slow sunday/ }),
  ).toBeVisible();
  await posts
    .first()
    .getByRole("button", {
      name: "Like event a weekend market wander",
      exact: true,
    })
    .click();
  await posts
    .first()
    .getByRole("button", {
      name: "Save event a weekend market wander",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    posts.first().getByRole("button", {
      name: "Like event a weekend market wander",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    posts.first().getByRole("button", {
      name: "Unsave event a weekend market wander",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "liked", exact: true }).click();
  await expect(posts).toHaveCount(1);
  await posts
    .first()
    .getByRole("button", {
      name: "Like event a weekend market wander",
      exact: true,
    })
    .click();
  await expect(posts).toHaveCount(0);
  await page.getByRole("button", { name: "saved", exact: true }).click();
  await expect(posts).toHaveCount(1);
  await page
    .getByRole("link", { name: "view saved events", exact: true })
    .click();
  await expect(page).toHaveURL(/\/favourites\?tab=events$/);
  await expect(page.locator(".saved-event-card")).toHaveCount(1);
  await page
    .getByRole("link", {
      name: "View event a weekend market wander",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/events\?event=market-wander$/);
  await expect(posts).toHaveCount(1);
  await expect
    .poll(() =>
      posts
        .first()
        .locator(".event-host")
        .evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ),
          );
        }),
    )
    .toBe(true);
  await expect(posts.first().locator(".event-more-details")).toHaveAttribute(
    "open",
    "",
  );
  await expect(posts.first().locator(".event-facts")).toContainText(
    "date & time TBA",
  );
  await expect(posts.first().locator(".event-facts")).toContainText(
    "venue TBA",
  );
  await posts
    .first()
    .getByRole("button", {
      name: "Unsave event a weekend market wander",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "back to all events", exact: true })
    .click();
  await page.getByRole("button", { name: "saved", exact: true }).click();
  await expect(posts).toHaveCount(0);
  await page
    .getByRole("button", { name: "see all events", exact: true })
    .click();
  await page.getByLabel("search events").fill("live music");
  await expect(posts).toHaveCount(1);
  await expect(posts.first()).toContainText("@melloway.live");
  await page.getByLabel("search events").fill("");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("event-poster-feed.png"),
    fullPage: true,
  });
  await posts
    .first()
    .getByRole("button", { name: "plan around this vibe", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/vibes$/);
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("melloway.draft")),
  );
  expect(draft.area).toBe("Inner West");
  expect(draft.preferences).toEqual(
    expect.arrayContaining(["Flea markets", "Vintage stores", "Brunch"]),
  );
  expect(errors).toEqual([]);
});

test("impossible hours show a recoverable empty state", async ({ page }) => {
  await page.goto("/plan/details?q=6");
  await chooseTime(page, "23:30");
  await continueQuestions(page, 4);
  await page.getByRole("button", { name: "submit", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "No three-stop plan fits",
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
