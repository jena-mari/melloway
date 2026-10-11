import { test, expect } from "@playwright/test";
import { mockMapTiles } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMapTiles(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { venues: "curated", recommendations: "planner" } }),
  );
});

test("edit profile, create a post, and retain identity after reload", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/community");
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  expect(await tabs.allTextContents()).toEqual(["", "", ""]);
  await expect(page.getByRole("tab", { name: "Your Posts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "edit profile", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("name", { exact: true }).fill("Jena");
  await dialog.getByLabel("username").fill("jena.outside");
  await dialog.getByLabel("bio").fill("matcha, little shops & good days.");
  await dialog.getByLabel("location", { exact: true }).fill("Sydney");
  await dialog.getByRole("button", { name: "matcha cover" }).click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8WQAAAAASUVORK5CYII=",
    "base64",
  );
  await dialog
    .getByLabel("Profile photo")
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  await expect(dialog.locator(".community-avatar img")).toBeVisible();
  await dialog.getByRole("button", { name: "save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Jena", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".profile-handle")).toHaveText("@jena.outside");
  await page.reload();
  await expect(page.locator(".profile-bio")).toHaveText(
    "matcha, little shops & good days.",
  );
  await expect(page.locator(".profile-cover")).toHaveClass(/cover-matcha/);
  await expect(page.locator(".profile-avatar-row img")).toBeVisible();
  // Cancel discards edits and Escape restores focus to the opener.
  await page.getByRole("button", { name: "edit profile", exact: true }).click();
  await dialog.getByLabel("name", { exact: true }).fill("Discard me");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "edit profile", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "edit profile", exact: true }).click();
  await expect(dialog.getByLabel("name", { exact: true })).toHaveValue("Jena");
  await dialog.getByRole("button", { name: "Close edit profile" }).click();
  await page.getByRole("link", { name: "Create a post" }).click();
  await expect(page.locator("#community-composer")).toBeVisible();
  await page.getByLabel("title", { exact: true }).fill("My Saturday");
  await page
    .getByLabel("post", { exact: true })
    .fill("Matcha and a wander around Newtown.");
  await page.getByRole("button", { name: "save to device feed" }).click();
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await expect(page.locator(".profile-content .community-post")).toHaveCount(1);
  await expect(page.locator(".community-byline")).toContainText("Jena");
  await expect(page.locator(".community-byline")).toContainText(
    "@jena.outside",
  );
  await page.getByRole("button", { name: "Like My Saturday" }).click();
  await page.getByRole("tab", { name: "Your Likes" }).click();
  await expect(
    page.getByRole("heading", { name: "My Saturday" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replies to My Saturday" }).click();
  await page
    .getByLabel("reply as Jena @jena.outside")
    .fill("A day worth keeping.");
  await page.getByRole("button", { name: "reply", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Replies to My Saturday" }).click();
  await expect(page.locator(".community-thread li")).toContainText(
    "A day worth keeping.",
  );
  await page.getByRole("button", { name: "Like My Saturday" }).click();
  await expect(page.locator(".profile-content .community-post")).toHaveCount(0);
  await page.goto("/community");
  await expect(
    page.getByRole("button", { name: "Like My Saturday" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("profile saved and liked tabs include routes and events with working actions", async ({
  page,
}) => {
  await page.goto("/community");
  const first = page.locator(".community-post").first();
  await first
    .getByRole("button", {
      name: "Like a slow saturday in newtown",
      exact: true,
    })
    .click();
  await first
    .getByRole("button", { name: "Save route a slow saturday in newtown" })
    .click();
  await page.goto("/events");
  await page
    .getByRole("button", {
      name: "Like event a weekend market wander",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Save event a weekend market wander",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await page.getByRole("tab", { name: "Your Saved" }).click();
  await expect(page.locator(".profile-saved-route")).toHaveCount(1);
  await expect(page.locator(".profile-event-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Open saved route Newtown" }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator(".stop-body h2").first()).toBeVisible();
  await page.goto("/profile?tab=likes");
  await expect(page.locator(".profile-content .community-post")).toHaveCount(1);
  await expect(page.locator(".profile-event-card")).toHaveCount(1);
  await page.getByRole("link", { name: "check full route here" }).click();
  await expect(page.locator(".community-place-list button")).toHaveCount(3);
  await page.goto("/profile?tab=likes");
  await page
    .getByRole("button", { name: "Unlike event a weekend market wander" })
    .click();
  await expect(page.locator(".profile-event-card")).toHaveCount(0);
  await page.getByRole("tab", { name: "Your Saved" }).click();
  await page
    .getByRole("button", { name: "Unsave route Newtown", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unsave event a weekend market wander" })
    .click();
  await expect(page.locator(".profile-empty")).toContainText(
    "nothing saved yet",
  );
  await page.reload();
  await expect(page.locator(".profile-empty")).toContainText(
    "nothing saved yet",
  );
  await page.goto("/events?event=market-wander");
  await expect(
    page.getByRole("button", { name: "Like event a weekend market wander" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Save event a weekend market wander" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("icon tabs support the keyboard and compact phones without overflow", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "edit profile", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("name", { exact: true }).fill("Jena");
  await dialog.getByLabel("username").fill("jena.takes.it.slow");
  await dialog.getByLabel("bio").fill("matcha, little shops & good days.");
  await dialog.getByRole("button", { name: "save", exact: true }).click();
  await page.getByRole("link", { name: "Create a post" }).click();
  await page.getByLabel("title", { exact: true }).fill("A good afternoon");
  await page
    .getByLabel("post", { exact: true })
    .fill("Found a new favourite café in Newtown.");
  await page.getByRole("button", { name: "save to device feed" }).click();
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await page.getByRole("tab", { name: "Your Posts" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Your Saved" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Your Saved" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Your Likes" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Your Posts" })).toBeFocused();
  await page.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "/private/tmp/melloway-profile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "edit profile", exact: true }).click();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Your Saved" }).click();
  await expect(page.locator(".profile-content")).toContainText(
    "nothing saved yet",
  );
});

test("profile editor keeps validation and storage failures visible inside the dialog", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "edit profile", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Profile photo")
    .setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(dialog.getByRole("alert")).toContainText("JPEG, PNG or WebP");
  await dialog.getByLabel("username").fill("invalid handle!");
  await dialog.getByRole("button", { name: "save", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(
    await dialog
      .getByLabel("username")
      .evaluate((input) => input.validity.patternMismatch),
  ).toBe(true);
  await dialog.getByLabel("username").fill("jena");
  await dialog.getByLabel("name", { exact: true }).fill("Jena");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "melloway.profile")
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole("button", { name: "save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Check device storage");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".profile-details h1")).toHaveText("you");
});
