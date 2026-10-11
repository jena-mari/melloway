import { test, expect } from "@playwright/test";
import { sydneyVenues } from "../../src/data/sydneyVenues.js";

const garden = sydneyVenues.find(
  (venue) => venue.name === "Royal Botanic Garden Sydney",
);
const tiktok = "https://www.tiktok.com/@garden/video/7123456789012345678";
const instagram = "https://www.instagram.com/reel/RealPost123/";
const shared = "https://www.instagram.com/p/SharedPost123/";
const posts = [
  {
    url: tiktok,
    caption: "A walk through the Sydney garden",
    creator: "garden",
    thumbnail: "https://images.example.test/garden.svg",
  },
  { url: instagram, caption: "Harbour views from the garden" },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        venues: "curated",
        recommendations: "planner",
        socialDiscovery: "openai",
      },
    }),
  );
  await page.route("**/api/social/search", (route) =>
    route.fulfill({ json: { posts } }),
  );
  await page.route("**/api/social/preview", (route) =>
    route.fulfill({
      json: {
        post: {
          url: route.request().postDataJSON().url,
          caption: "Shared garden post",
        },
      },
    }),
  );
  await page.route("https://www.instagram.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0;font-family:sans-serif"><div style="padding:12px">garden · Instagram</div><div style="height:400px;background:#dce9cb;display:grid;place-items:center">Public garden post · test fixture</div></body></html>',
    }),
  );
  await page.route("https://www.tiktok.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>TikTok player fixture</p>",
    }),
  );
  await page.route("https://images.example.test/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#cadcb0"/><path d="M140 400V0M0 100H300" stroke="white" stroke-width="25"/><text x="20" y="240" fill="#333" font-size="18">Garden preview fixture</text></svg>',
    }),
  );
});

test("real-post grid filters and opens official players, with no blank hero or mobile overflow", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/venue/${garden.id}`);
  await expect(page.getByRole("heading", { name: garden.name })).toBeVisible();
  await expect(page.locator(".venue-photo")).toHaveCount(0);
  await expect(page.locator(".venue-social-card")).toHaveCount(2);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/melloway-social-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "TikTok", exact: true }).click();
  await expect(page.locator(".venue-social-card")).toHaveCount(1);
  const trigger = page.getByRole("button", {
    name: "watch TikTok post by garden",
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("iframe")).toHaveAttribute(
    "src",
    /www.tiktok.com\/player\/v1\/7123456789012345678/,
  );
  await expect(
    dialog.getByRole("link", { name: "open on TikTok" }),
  ).toHaveAttribute("href", tiktok);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Instagram", exact: true }).click();
  await page
    .getByRole("button", { name: "watch Instagram post", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("iframe")).toHaveAttribute(
    "src",
    `${instagram}embed/`,
  );
  await page.getByRole("button", { name: "close post" }).click();
  expect(errors).toEqual([]);
});

test("shared public links validate, persist locally, and can be removed", async ({
  page,
}) => {
  await page.goto(`/venue/${garden.id}`);
  await expect(page.locator(".venue-social-card")).toHaveCount(2);
  await page.getByRole("button", { name: "add a post" }).click();
  await page
    .getByLabel("post link", { exact: true })
    .fill("https://www.instagram.com.evil.test/p/SharedPost123/");
  await page.getByRole("button", { name: "add", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Use a TikTok video or Instagram post link.",
  );
  await page.getByLabel("post link", { exact: true }).fill(shared);
  await page.getByRole("button", { name: "add", exact: true }).click();
  await expect(page.locator(".venue-social-card")).toHaveCount(3);
  await page.reload();
  await expect(page.getByText("Shared garden post")).toBeVisible();
  await page
    .getByRole("button", { name: "remove shared Instagram post" })
    .click();
  await expect(page.locator(".venue-social-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".venue-social-card")).toHaveCount(2);
});

test("failed discovery and blocked previews keep venue details and original-post links usable", async ({
  page,
}) => {
  await page.route("**/api/social/search", (route) =>
    route.fulfill({ status: 502, json: { error: "Unavailable" } }),
  );
  await page.route("**/api/social/preview", (route) =>
    route.fulfill({ status: 502, json: { error: "Unavailable" } }),
  );
  await page.goto(`/venue/${garden.id}`);
  await expect(
    page.getByText("Post search is unavailable right now."),
  ).toBeVisible();
  await expect(page.getByText("45 minutes", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "find on TikTok" }),
  ).toHaveAttribute("href", /Royal%20Botanic%20Garden%20Sydney/);
  await page.getByRole("button", { name: "add a post" }).click();
  await page.getByLabel("post link", { exact: true }).fill(tiktok);
  await page.getByRole("button", { name: "add", exact: true }).click();
  await page
    .getByRole("button", { name: "watch TikTok post", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "open on TikTok" }),
  ).toHaveAttribute("href", tiktok);
  await page.getByRole("button", { name: "close post" }).click();
  await expect(
    page.getByRole("link", { name: "check it on Google Maps" }),
  ).toBeVisible();
});

test("disabled search does not request AI discovery", async ({ page }) => {
  let searches = 0;
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { socialDiscovery: "unavailable" } }),
  );
  await page.route("**/api/social/search", (route) => {
    searches++;
    return route.fulfill({ json: { posts: [] } });
  });
  await page.goto(`/venue/${garden.id}`);
  await expect(page.getByText("No public posts found yet.")).toBeVisible();
  expect(searches).toBe(0);
});
