import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { parseSocialMediaUrl } from "@melloway/domain";
import { hack48, hack48Path, maxEventImageBytes, maxEventAttachments } from "../src/data/hack48.js";

export class EventMediaError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const types = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export function eventReel(value) {
  const post = typeof value === "string" ? parseSocialMediaUrl(value) : null;
  if (post?.platform !== "instagram") throw new EventMediaError("Paste a full Instagram Reel link.");
  return { platform: post.platform, postId: post.id, url: post.normalizedUrl };
}
export function validateEventImage(bytes, type) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxEventImageBytes)
    throw new EventMediaError("Choose an image up to 1.5 MB.", 413);
  const valid = type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : type === "image/webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
    : false;
  if (!valid) throw new EventMediaError("Choose a JPEG, PNG or WebP image. The file must match its image type.");
  return types[type];
}

/** One shared Wi-Fi event. Atomic JSON + image files, with a private edit code. */
export function createHack48Store({ directory = resolve(".local/shared-events"), editCode, now = () => new Date() } = {}) {
  const file = join(directory, "hack48.json"), codeFile = join(directory, "hack48.edit-code");
  let writes = Promise.resolve();
  const serial = (operation) => {
    const result = writes.then(operation);
    writes = result.catch(() => {});
    return result;
  };
  const prepare = () => mkdir(directory, { recursive: true, mode: 0o700 });
  async function ownerCode() {
    if (editCode) return editCode;
    await prepare();
    try { await writeFile(codeFile, randomBytes(24).toString("base64url"), { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const value = (await readFile(codeFile, "utf8")).trim();
    if (value.length < 20 || value.length > 200) throw new Error("Invalid event edit configuration");
    return value;
  }
  async function attachments() {
    let value;
    try { value = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return []; throw new Error("Invalid event storage"); }
    if (value?.version !== 1 || value.eventId !== hack48.id || !Array.isArray(value.attachments)
      || value.attachments.length > maxEventAttachments) throw new Error("Invalid event storage");
    const ids = new Set(), reels = new Set();
    for (const item of value.attachments) {
      if (!item || !uuid.test(item.id) || ids.has(item.id) || typeof item.savedAt !== "string"
        || !Number.isFinite(Date.parse(item.savedAt))) throw new Error("Invalid event storage");
      ids.add(item.id);
      if (item.kind === "image") {
        if (!types[item.mimeType] || item.url !== `${hack48Path}/images/${item.id}`) throw new Error("Invalid event storage");
      } else if (item.kind === "reel") {
        let post;
        try { post = eventReel(item.url); } catch { throw new Error("Invalid event storage"); }
        if (item.platform !== post.platform || item.postId !== post.postId || item.url !== post.url || reels.has(post.postId))
          throw new Error("Invalid event storage");
        reels.add(post.postId);
      } else throw new Error("Invalid event storage");
    }
    return value.attachments;
  }
  async function save(items) {
    await prepare();
    const temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, eventId: hack48.id, attachments: items }), { flag: "wx", mode: 0o600 });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
  }
  const room = (items) => { if (items.length >= maxEventAttachments) throw new EventMediaError("This prototype supports up to 20 event attachments.", 409); };
  return {
    async get() { await ownerCode(); return { ...hack48, attachments: await attachments() }; },
    async authorize(value) {
      if (typeof value !== "string" || !value || value.length > 200) return false;
      const hash = text => createHash("sha256").update(text).digest();
      return timingSafeEqual(hash(value), hash(await ownerCode()));
    },
    addReel: value => serial(async () => {
      const reel = eventReel(value), items = await attachments();
      if (items.some(item => item.kind === "reel" && item.postId === reel.postId)) throw new EventMediaError("That Reel is already attached to Hack48.", 409);
      room(items);
      await save([...items, { id: randomUUID(), kind: "reel", ...reel, savedAt: now().toISOString() }]);
      return { ...hack48, attachments: await attachments() };
    }),
    addImage: (bytes, mimeType) => serial(async () => {
      const extension = validateEventImage(bytes, mimeType), items = await attachments();
      room(items);
      const id = randomUUID(), imageFile = join(directory, `${id}.${extension}`);
      await prepare();
      await writeFile(imageFile, bytes, { flag: "wx", mode: 0o600 });
      try { await save([...items, { id, kind: "image", mimeType, url: `${hack48Path}/images/${id}`, savedAt: now().toISOString() }]); }
      catch (error) { await rm(imageFile, { force: true }); throw error; }
      return { ...hack48, attachments: await attachments() };
    }),
    async image(id) {
      if (!uuid.test(id)) throw new EventMediaError("Image not found.", 404);
      const item = (await attachments()).find(item => item.id === id && item.kind === "image");
      if (!item) throw new EventMediaError("Image not found.", 404);
      return { mimeType: item.mimeType, bytes: await readFile(join(directory, `${id}.${types[item.mimeType]}`)) };
    },
  };
}

function body(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, tooLarge = false;
    req.on("data", chunk => {
      if (tooLarge) return; // Drain without retaining an oversized upload.
      size += chunk.length;
      if (size > limit) { tooLarge = true; reject(new EventMediaError("Attachment is too large.", 413)); }
      else chunks.push(chunk);
    });
    req.on("end", () => { if (!tooLarge) resolve(Buffer.concat(chunks)); });
    req.on("error", () => reject(new EventMediaError("Upload interrupted. Please try again.")));
    req.on("aborted", () => reject(new EventMediaError("Upload interrupted. Please try again.")));
  });
}
export function createHack48Handler(options = {}) {
  const store = options.store ?? createHack48Store(options);
  return async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    const path = new URL(req.url, "http://localhost").pathname;
    try {
      if (req.method === "GET" && path === hack48Path) return json(200, { event: await store.get() });
      if (req.method === "GET" && path.startsWith(`${hack48Path}/images/`)) {
        const image = await store.image(path.slice(`${hack48Path}/images/`.length));
        res.writeHead(200, { "Content-Type": image.mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600" });
        return res.end(image.bytes);
      }
      if (req.method !== "POST" || ![`${hack48Path}/images`, `${hack48Path}/reels`].includes(path)) return json(404, { error: "Endpoint not found" });
      const code = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{1,200})$/)?.[1];
      if (!await store.authorize(code)) return json(403, { error: "Enter the organiser edit code to add media." });
      if (path.endsWith("/images")) {
        const bytes = await body(req, maxEventImageBytes);
        return json(201, { event: await store.addImage(bytes, req.headers["content-type"]) });
      }
      let value;
      try { value = JSON.parse((await body(req, 4096)).toString("utf8")); }
      catch (error) { if (error instanceof EventMediaError) throw error; throw new EventMediaError("Paste a full Instagram Reel link."); }
      return json(201, { event: await store.addReel(value?.url) });
    } catch (error) {
      return json(error instanceof EventMediaError ? error.status : 503,
        { error: error instanceof EventMediaError ? error.message : "Shared event storage is unavailable. Try again or ask the organiser." });
    }
  };
}
