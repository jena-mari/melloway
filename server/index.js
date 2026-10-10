import http from "node:http";
import { validPreferences } from "../src/utils/planner.js";
import { createGoogleProvider } from "./google.js";
import { createEventMapHandler } from "./eventMap.ts";
const eventMapHandler = createEventMapHandler();
const key = process.env.GOOGLE_MAPS_API_KEY,
  provider = createGoogleProvider(key);
const rates = new Map();
const allowedOrigins = (process.env.APP_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const reply = (status, data) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    if (!origin || !allowedOrigins.includes(origin))
      return reply(403, { error: "Origin is not configured" });
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method === "GET" && req.url === "/api/status")
      return reply(200, { venues: key ? "google" : "demo" });
    const photoRequest =
      req.method === "GET" && req.url.startsWith("/api/photo?");
    const eventsRequest = req.method === "GET" && ["/api/events", "/api/events-map"].includes(req.url.split("?")[0]);
    if (
      !photoRequest && !eventsRequest &&
      (req.method !== "POST" ||
        !["/api/venues", "/api/matrix"].includes(req.url))
    )
      return reply(404, { error: "Endpoint not found" });
    if (!key && !eventsRequest)
      return reply(503, { error: "Google credentials are not configured" });
    const ip = req.socket.remoteAddress,
      now = Date.now();
    let rate = rates.get(ip);
    if (!rate || now - rate.start > 60000) {
      rate = { start: now, count: 0 };
      rates.set(ip, rate);
    }
    if (++rate.count > 40)
      return reply(429, { error: "Please retry in a minute" });
    if (rates.size > 10000) rates.clear();
    if (eventsRequest) return await eventMapHandler(req, res);
    if (photoRequest) {
      const name = new URL(req.url, "http://localhost").searchParams.get(
        "name",
      );
      if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name || ""))
        return reply(400, { error: "Invalid photo" });
      const photo = await provider.photo(name);
      res.setHeader("Content-Type", photo.type);
      return res.end(photo.body);
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000)
        return reply(413, { error: "Request too large" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, { error: "Invalid JSON" });
    }
    const { prefs } = body;
    if (!validPreferences(prefs))
      return reply(400, { error: "Invalid planning details" });
    if (req.url === "/api/venues")
      return reply(200, { venues: await provider.discover(prefs) });
    const { venues } = body;
    if (
      !Array.isArray(venues) ||
      !venues.length ||
      venues.length > 14 ||
      venues.some(
        (p) =>
          !p ||
          !Number.isFinite(p.lat) ||
          !Number.isFinite(p.lng) ||
          p.lat < -34.3 ||
          p.lat > -33.3 ||
          p.lng < 150.5 ||
          p.lng > 151.6,
      )
    )
      return reply(400, { error: "Invalid venue coordinates" });
    return reply(200, { matrix: await provider.routeMatrix(venues, prefs) });
  } catch {
    reply(502, { error: "External provider unavailable" });
  }
});
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3001;
server.listen(port, host, () =>
  console.log(`melloway API listening on http://${host}:${port}`),
);
