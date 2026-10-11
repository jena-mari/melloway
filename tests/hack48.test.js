import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHack48Store, eventReel, validateEventImage } from "../server/hack48.js";
import { createApiServer } from "../server/index.js";
import { hack48, hack48Path, maxEventImageBytes, maxEventAttachments } from "../src/data/hack48.js";

// Temporary fixtures only. No real image upload, Instagram request or provider call.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
const reel = "https://www.instagram.com/reel/MockHack48Reel/";
const code = "mock_organiser_edit_code";
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "melloway-mock-hack48-"));
  const store = createHack48Store({ directory, editCode: code, now: () => new Date("2026-10-11T01:00:00Z") });
  try { await run(store, directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("Hack48 has the supplied dates/address and no invented prices, coordinates or session times", async () => fixture(async store => {
  const event = await store.get();
  assert.equal(event.title, "Hack48");
  assert.equal(event.address, "33 Moses Way, Winston Hills NSW 2153");
  assert.equal(event.startDate, "2026-10-10");
  assert.equal(event.endDate, "2026-10-12");
  assert.equal(event.timezone, "Australia/Sydney");
  assert.equal(event.entry, "Price unavailable");
  assert.ok(!("lat" in event));
  assert.ok(!("startTime" in event));
  assert.deepEqual(event.attachments, []);
  assert.ok(!JSON.stringify(event).includes(code));
}));

test("Reels reuse the social parser; unsupported links fail and normalized duplicates are rejected", async () => fixture(async store => {
  assert.deepEqual(eventReel(reel + "?igsh=mock"), { platform: "instagram", postId: "MockHack48Reel", url: reel });
  for (const bad of ["javascript:alert(1)", "https://instagram.com.evil.test/reel/Mock/", "https://www.instagram.com/p/MockPost/",
    "https://www.tiktok.com/@mock/video/1234567890123456789", "https://www.instagram.com/mock", null]) {
    assert.throws(() => eventReel(bad), /full Instagram Reel/);
  }
  await store.addReel(reel + "?igsh=mock");
  await assert.rejects(store.addReel(reel), /already attached/);
  assert.equal((await store.get()).attachments.length, 1);
}));

test("image format, content signature and size are checked before storage", async () => fixture(async (store, directory) => {
  assert.equal(validateEventImage(png, "image/png"), "png");
  assert.throws(() => validateEventImage(png, "image/jpeg"), /match its image type/);
  assert.throws(() => validateEventImage(Buffer.from("<svg onload=alert(1) />"), "image/svg+xml"), /JPEG, PNG or WebP/);
  assert.throws(() => validateEventImage(Buffer.alloc(maxEventImageBytes + 1), "image/png"), /1.5 MB/);
  const event = await store.addImage(png, "image/png");
  assert.equal(event.attachments.length, 1);
  assert.equal(event.attachments[0].savedAt, "2026-10-11T01:00:00.000Z");
  const image = await store.image(event.attachments[0].id);
  assert.deepEqual(image.bytes, png);
  assert.equal(image.mimeType, "image/png");
  assert.equal((await stat(join(directory, `${event.attachments[0].id}.png`))).mode & 0o777, 0o600);
  await assert.rejects(store.image("../hack48.edit-code"), /not found/);
}));

test("two independent clients/stores see persisted media; concurrent writes keep every record", async () => fixture(async (store, directory) => {
  await Promise.all([store.addImage(png, "image/png"), store.addReel(reel)]);
  const otherClient = createHack48Store({ directory, editCode: code });
  const records = (await otherClient.get()).attachments;
  assert.equal(records.length, 2);
  assert.equal(records.filter(item => item.kind === "image").length, 1);
  assert.equal(records.filter(item => item.kind === "reel").length, 1);
  assert.ok((await readFile(join(directory, "hack48.json"), "utf8")).includes(reel));
}));

test("malformed storage is not overwritten; unknown image IDs and private edit files are inaccessible", async () => fixture(async (store, directory) => {
  const file = join(directory, "hack48.json");
  for (const contents of ["broken mock JSON", JSON.stringify({ version: 1, eventId: "wrong", attachments: [] }),
    JSON.stringify({ version: 1, eventId: hack48.id, attachments: [{ id: "../private", kind: "image" }] })]) {
    await writeFile(file, contents);
    await assert.rejects(store.get(), /Invalid event storage/);
    await assert.rejects(store.addReel(reel), /Invalid event storage/);
    await assert.rejects(store.addImage(png, "image/png"), /Invalid event storage/);
    assert.equal(await readFile(file, "utf8"), contents);
  }
}));

test("attachment cap rejects additional uploads without losing earlier records", async () => fixture(async store => {
  for (let index = 0; index < maxEventAttachments; index++) await store.addReel(`https://www.instagram.com/reel/MockLimit${index}/`);
  await assert.rejects(store.addImage(png, "image/png"), /up to 20/);
  await assert.rejects(store.addReel(reel), /up to 20/);
  assert.equal((await store.get()).attachments.length, maxEventAttachments);
}));

test("automatic organiser code persists privately and is never part of event JSON", async () => fixture(async (_store, directory) => {
  const first = createHack48Store({ directory });
  await first.get();
  const value = await readFile(join(directory, "hack48.edit-code"), "utf8");
  assert.equal((await stat(join(directory, "hack48.edit-code"))).mode & 0o777, 0o600);
  assert.equal(await first.authorize(value), true);
  assert.equal(await createHack48Store({ directory }).authorize(value), true);
  assert.equal(await first.authorize("mock_wrong_code"), false);
  assert.equal(await first.authorize(undefined), false);
  assert.ok(!JSON.stringify(await first.get()).includes(value));
}));

test("HTTP workflow permits public viewing, protects uploads, and shares media across clients", async () => fixture(async (_store, directory) => {
  const forbidden = async () => assert.fail("External providers are forbidden in this test");
  const server = createApiServer({ env: { SHARED_EVENTS_DIRECTORY: directory, HACK48_EDIT_CODE: code },
    googleProvider: { discover: forbidden }, recommendationProvider: { rank: forbidden }, socialProvider: { discover: forbidden },
    instagramEventsProvider: { discover: forbidden }, eventsHandler: forbidden });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, type = "application/json", owner = code) => fetch(base + hack48Path + path,
    { method: "POST", headers: { "Content-Type": type, ...(owner ? { Authorization: `Bearer ${owner}` } : {}) }, body });
  try {
    assert.equal((await fetch(base + hack48Path)).status, 200);
    assert.equal((await post("/reels", JSON.stringify({ url: reel }), undefined, "")).status, 403);
    assert.equal((await post("/reels", JSON.stringify({ url: reel }), undefined, "mock_wrong")).status, 403);
    assert.equal((await post("/reels", "not JSON")).status, 400);
    assert.equal((await post("/reels", JSON.stringify({ url: reel }))).status, 201);
    assert.equal((await post("/reels", JSON.stringify({ url: reel + "?igsh=mock" }))).status, 409);
    assert.equal((await post("/images", png, "image/png")).status, 201);
    assert.equal((await post("/images", png, "image/jpeg")).status, 400);
    assert.equal((await post("/images", Buffer.alloc(maxEventImageBytes + 1), "image/png")).status, 413);
    const event = (await (await fetch(base + hack48Path)).json()).event;
    assert.equal(event.attachments.length, 2);
    assert.ok(!JSON.stringify(event).includes(code));
    const image = await fetch(base + event.attachments.find(item => item.kind === "image").url);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    assert.equal((await fetch(base + hack48Path + "/images/hack48.edit-code")).status, 404);
    assert.equal((await fetch(base + "/api/shared-events/unknown")).status, 404);
    assert.equal((await fetch(base + hack48Path, { method: "DELETE" })).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
