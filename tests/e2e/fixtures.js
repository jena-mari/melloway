// Map interactions use a local tile fixture, never the public tile service.
export async function mockMapTiles(page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f6f5f2"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" fill="none" stroke="white" stroke-width="8"/><text x="100" y="128" fill="#aaa" font-size="10">test tile</text></svg>',
    }),
  );
}
