import { createRecommendationResearchProvider } from './recommendationResearch.js';
import { recommendationLeads } from '../src/data/recommendationSources.js';
import { attachRecommendationEvidence } from '../src/engine/recommendationEvidence.js';
import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEventsHandler } from "./events.ts";
import { selectGoogleMapsBrowserKey } from "./googleMapsBrowserKey.ts";
import { createSocialLinkHandler } from "./socialLinks.ts";
import { createTikTokPlacesHandler } from "./tiktokPlacesMap.ts";
import { createItineraryMapHandler } from "./itineraryMap.ts";
import { validPreferences } from "../src/utils/planner.js";
import { localLocations } from "../src/utils/location.js";
import { createGoogleProvider } from "./google.js";
import { createSocialProvider, validSocialVenue } from "./social.js";
import { createInstagramEventsProvider, InstagramDiscoveryError } from "./instagramEvents.js";
import { socialPost } from "../src/utils/social.js";
import {
  createOpenAIProvider,
  defaultRecommendationModel,
  validRecommendationVenues,
} from "./openai.js";
/** Provider injection keeps API-contract regression tests offline. */
export function createApiServer(options = {}) {
  const env = options.env ?? process.env;
  const key = env.GOOGLE_MAPS_API_KEY,
    provider = options.googleProvider ?? createGoogleProvider(key);
  const openaiKey = env.OPENAI_API_KEY;
  const recommendations =
    options.recommendationProvider ??
    createOpenAIProvider(
      openaiKey,
      env.OPENAI_MODEL || defaultRecommendationModel,
    );
  const social =
    options.socialProvider ??
    createSocialProvider(
      openaiKey,
      env.OPENAI_MODEL || defaultRecommendationModel,
    );
  const socialSearchEnabled =
    Boolean(openaiKey) && env.OPENAI_SOCIAL_SEARCH !== "false";
  const instagramEvents = options.instagramEventsProvider ?? createInstagramEventsProvider(
    openaiKey, env.OPENAI_MODEL || defaultRecommendationModel,
  );
  const researchEnabled = Boolean(openaiKey) && env.OPENAI_RECOMMENDATION_RESEARCH !== 'false';
  const research = options.researchProvider ?? createRecommendationResearchProvider(openaiKey, env.OPENAI_MODEL || defaultRecommendationModel);
  const rates = new Map();
  const recommendationRates = new Map();
  const allowedOrigins = (env.APP_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const eventsHandler = options.eventsHandler ?? createEventsHandler();
  const eventsMapHandler = options.eventsMapHandler ?? eventsHandler;
  const socialLinkHandler = options.socialLinkHandler ?? createSocialLinkHandler();
  const tiktokPlacesHandler = options.tiktokPlacesHandler ?? createTikTokPlacesHandler();
  const itineraryMapHandler = options.itineraryMapHandler ?? createItineraryMapHandler();
  return http.createServer(async (req, res) => {
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
      // This is deliberately a PUBLIC, referrer-restricted browser key.
      // Private Places/Routes/OpenAI credentials must never be fallbacks here.
      if (req.method === "GET" && req.url === "/api/maps/config")
        return reply(200, {
          apiKey: selectGoogleMapsBrowserKey(env),
          mapId: env.GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID",
        });
      if (req.method === "GET" && req.url === "/api/status")
        return reply(200, {
          venues: key ? "google" : "curated",
          recommendations: openaiKey ? "openai" : "planner",
          socialDiscovery: socialSearchEnabled ? "openai" : "unavailable",
        });
      const recommendationRequest = [
        "/api/recommendations",
        "/api/intent",
      ].includes(req.url);
      const researchRequest = req.url === '/api/discovery';
      const locationSearch = req.url === "/api/locations/search";
      const locationResolve = req.url === "/api/locations/resolve";
      const socialSearch = req.url === "/api/social/search";
      const instagramEventsSearch = req.url === "/api/social/events";
      const socialPreview = req.url === "/api/social/preview";
      const photoRequest =
        req.method === "GET" && req.url.startsWith("/api/photo?");
      const eventsRequest =
        req.method === "GET" && ["/api/events"].includes(req.url.split("?")[0]);
      const eventsMapRequest = req.method === "GET" && req.url.split("?")[0] === "/api/events-map";
      const tiktokPlacesRequest = req.method === "GET" && ["/api/tiktok-places", "/api/tiktok-places-map"].includes(req.url.split("?")[0]);
      const itineraryMapRequest = req.method === "GET" && req.url.split("?")[0] === "/api/itinerary-map";
      const socialLinkRequest = req.method === "POST" && req.url === "/api/social-link";
      if (
        !photoRequest &&
        !eventsMapRequest && !tiktokPlacesRequest && !itineraryMapRequest && !socialLinkRequest &&
        !eventsRequest &&
        (req.method !== "POST" ||
          ![
            "/api/discovery",
            "/api/venues",
            "/api/matrix",
            "/api/recommendations",
            "/api/intent",
            "/api/locations/search",
            "/api/locations/resolve",
            "/api/social/search",
            "/api/social/events",
            "/api/social/preview",
          ].includes(req.url))
      )
        return reply(404, { error: "Endpoint not found" });
      if (recommendationRequest && !openaiKey)
        return reply(503, { error: "OpenAI is not configured" });
      if ((socialSearch || instagramEventsSearch) && !socialSearchEnabled)
        return reply(503, { error: "Social search is unavailable" });
      if (
        !key &&
        !researchRequest &&
        !locationSearch &&
        !recommendationRequest &&
        !eventsRequest &&
        !eventsMapRequest && !tiktokPlacesRequest && !itineraryMapRequest && !socialLinkRequest &&
        !socialSearch &&
        !instagramEventsSearch &&
        !socialPreview
      )
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
      if (recommendationRequest || socialSearch || instagramEventsSearch || (researchRequest && researchEnabled)) {
        let aiRate = recommendationRates.get(ip);
        if (!aiRate || now - aiRate.start > 60000) {
          aiRate = { start: now, count: 0 };
          recommendationRates.set(ip, aiRate);
        }
        if (++aiRate.count > 6)
          return reply(429, { error: "Please retry in a minute" });
        if (recommendationRates.size > 10000) recommendationRates.clear();
      }
      if (eventsRequest) return await eventsHandler(req, res);
      if (eventsMapRequest) return await eventsMapHandler(req, res);
      if (tiktokPlacesRequest) return await tiktokPlacesHandler(req, res);
      if (itineraryMapRequest) return await itineraryMapHandler(req, res);
      if (socialLinkRequest) return await socialLinkHandler(req, res);
      if (photoRequest) {
        const name = new URL(req.url, "http://localhost").searchParams.get(
          "name",
        );
        if (
          !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name || "")
        )
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
      if (instagramEventsSearch) {
        try { return reply(200, { posts: await instagramEvents.discover() }); }
        catch (error) {
          return reply(502, { error: "Instagram discovery unavailable", code: error instanceof InstagramDiscoveryError ? error.code : "provider_unavailable", reason: error instanceof InstagramDiscoveryError ? error.reason : "unknown" });
        }
      }
      if (socialSearch) {
        if (!validSocialVenue(body?.venue))
          return reply(400, { error: "Invalid Sydney venue" });
        return reply(200, { posts: await social.discover(body.venue) });
      }
      if (socialPreview) {
        if (!socialPost(body?.url))
          return reply(400, {
            error: "Use a TikTok video or Instagram post link",
          });
        return reply(200, { post: await social.preview(body.url) });
      }
      if (locationSearch || locationResolve) {
        const { query, placeId, sessionToken } = body;
        if (
          typeof sessionToken !== "string" ||
          !/^[a-zA-Z0-9_-]{1,36}$/.test(sessionToken)
        )
          return reply(400, { error: "Invalid search session" });
        if (locationSearch) {
          if (
            typeof query !== "string" ||
            query.trim().length < 2 ||
            query.length > 150
          )
            return reply(400, { error: "Enter a short location search" });
          return reply(200, {
            source: key ? "google" : "local",
            suggestions: key
              ? await provider.searchLocations(query.trim(), sessionToken)
              : localLocations(query),
          });
        }
        if (
          typeof placeId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,200}$/.test(placeId)
        )
          return reply(400, { error: "Invalid location" });
        return reply(200, {
          location: await provider.resolveLocation(placeId, sessionToken),
        });
      }
      const { prefs } = body;
      if (!validPreferences(prefs))
        return reply(400, { error: "Invalid planning details" });
      if (researchRequest) {
        let leads = recommendationLeads, researchStatus = 'sources';
        if (researchEnabled) {
          try { leads = [...await research.discover(prefs), ...leads]; researchStatus = 'web'; }
          catch { researchStatus = 'unavailable'; }
        }
        // Resolve only source-supported candidates relevant to this request.
        const interests = prefs.preferences.length ? prefs.preferences : ['Coffee shops', 'Art galleries', 'Scenic walks'];
        const relevant = leads.filter(lead => lead.visitMode !== 'event-service' && lead.tags.some(tag => interests.includes(tag)))
          .sort((a, b) => Number(b.locality.toLowerCase() === prefs.area.toLowerCase()) - Number(a.locality.toLowerCase() === prefs.area.toLowerCase()));
        const unique = [];
        for (const lead of relevant) if (!unique.some(other => other.name.toLowerCase() === lead.name.toLowerCase() && other.locality.toLowerCase() === lead.locality.toLowerCase())) unique.push(lead);
        const shortlist = [];
        for (const tag of interests) {
          const lead = unique.find(lead => lead.tags.includes(tag) && !shortlist.includes(lead));
          if (lead && shortlist.length < 6) shortlist.push(lead);
        }
        for (const lead of unique) if (shortlist.length < 6 && !shortlist.includes(lead)) shortlist.push(lead);
        let venues = [];
        if (key && provider.resolveResearch) {
          try { venues = attachRecommendationEvidence(await provider.resolveResearch(prefs, shortlist), leads); }
          catch { /* Research still enriches existing, operator-verified venues. */ }
        }
        return reply(200, { leads, venues, researchStatus });
      }
      if (recommendationRequest) {
        if (
          req.url !== "/api/intent" &&
          !validRecommendationVenues(body.venues)
        )
          return reply(400, { error: "Invalid recommendation places" });
        const controller = new AbortController();
        const cancel = () => controller.abort();
        res.on("close", cancel);
        try {
          if (req.url === "/api/intent")
            return reply(200, {
              intent: await recommendations.interpret(prefs, controller.signal),
            });
          return reply(200, {
            rankings: await recommendations.rank(
              prefs,
              body.venues,
              controller.signal,
            ),
          });
        } finally {
          res.off("close", cancel);
        }
      }
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
}

// Importing the server for mocked tests must not bind a port or run providers.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || "127.0.0.1";
  createApiServer().listen(port, host, () =>
    console.log(`melloway API listening on http://${host}:${port}`),
  );
}
