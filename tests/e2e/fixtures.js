import { localLocations } from "../../src/utils/location.js";
// Map interactions use a local tile fixture, never the public tile service.
export async function mockMapTiles(page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f6f5f2"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" fill="none" stroke="white" stroke-width="8"/><text x="100" y="128" fill="#aaa" font-size="10">test tile</text></svg>',
    }),
  );
}

export async function continueQuestions(page, count = 1) {
  for (let i = 0; i < count; i++)
    await page.getByRole("button", { name: "continue", exact: true }).click();
}

export async function chooseTime(page, value) {
  const [hour, minute] = value.split(":").map(Number);
  await page
    .getByLabel("hour", { exact: true })
    .selectOption(String(hour % 12 || 12));
  await page.getByLabel("minute", { exact: true }).selectOption(String(minute));
  await page
    .getByLabel("am or pm", { exact: true })
    .selectOption(hour >= 12 ? "pm" : "am");
}

export async function mockLocationSearch(page) {
  await page.route("**/api/locations/search", (route) =>
    route.fulfill({
      json: {
        source: "local",
        suggestions: localLocations(route.request().postDataJSON().query),
      },
    }),
  );
}
export async function chooseArea(page, area) {
  await page.getByLabel("any specific location in mind?").fill(area);
  await page
    .locator("#sydney-location-results")
    .getByRole("option")
    .filter({ hasText: area })
    .first()
    .click();
}
