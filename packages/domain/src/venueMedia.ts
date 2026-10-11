/** Public media only. No credentials, scraped HTML or engagement guesses. */
export interface MediaVenue { name: string; address: string; lat: number; lng: number }
export interface VenueMedia {
  url: string; platform: 'TikTok' | 'Instagram'; id: string;
  caption?: string; creator?: string; thumbnail?: string;
  venueKey?: string; locationEvidence?: string;
  metadataSource?: 'official-oembed' | 'source-excerpt';
}
export interface SocialContext {
  venueKey: string; inferred: true; atmosphere: string[]; interests: string[];
  sources: { url: string; caption: string; metadataSource: string }[];
}
const words = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function mediaVenueKey(venue: MediaVenue): string {
  return JSON.stringify([words(venue.name), words(venue.address), venue.lat, venue.lng]);
}
function safeThumbnail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
export function publicMedia(value: unknown): VenueMedia | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, '');
    const tt = host === 'tiktok.com' && url.pathname.match(/^\/@([\w.-]+)\/video\/(\d{15,25})\/?$/);
    if (tt) return { platform: 'TikTok', id: tt[2], url: `https://www.tiktok.com/@${tt[1]}/video/${tt[2]}` };
    const ig = host === 'instagram.com' && url.pathname.match(/^\/(?:[\w.]+\/)?(p|reel)\/([\w-]{5,40})\/?$/);
    if (ig) return { platform: 'Instagram', id: ig[2], url: `https://www.instagram.com/${ig[1]}/${ig[2]}/` };
  } catch { /* Invalid URL. */ }
  return null;
}
function street(address: string): string {
  const line = address.split(',').find(part => /\d/.test(part) && /\b(street|st|road|rd|lane|ln|avenue|ave)\b/i.test(part));
  return words(line || address).replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln').replace(/\bavenue\b/g, 'ave');
}
/** Name alone cannot distinguish branches. Require a source excerpt with the street. */
export function matchesMediaVenue(venue: MediaVenue, candidate: { venueName?: unknown; venueAddress?: unknown; locationEvidence?: unknown }): boolean {
  if (typeof candidate.venueName !== 'string' || typeof candidate.venueAddress !== 'string' || typeof candidate.locationEvidence !== 'string') return false;
  const name = words(venue.name), address = street(venue.address), evidence = street(candidate.locationEvidence);
  return name.length >= 2 && words(candidate.venueName) === name && address.length > 5 &&
    street(candidate.venueAddress) === address && words(candidate.locationEvidence).includes(name) &&
    evidence.includes(address) && !/\b(melbourne|brisbane|perth|adelaide)\b/i.test(candidate.locationEvidence);
}
const atmosphereRules: [string, RegExp][] = [
  ['quiet', /\b(quiet|peaceful|tranquil)\b/], ['relaxed', /\b(cozy|cosy|relaxed|chill)\b/],
  ['romantic', /\b(romantic|date night)\b/], ['intimate', /\bintimate\b/],
  ['lively', /\b(lively|nightlife|dancing|energetic)\b/], ['outdoor', /\b(outdoor|garden|picnic)\b/],
  ['creative', /\b(art|gallery|creative)\b/], ['upscale', /\b(upscale|fine dining)\b/],
];
const interestRules: [string, RegExp][] = [
  ['Thrifting', /\b(thrifting|vintage clothing|secondhand|second hand)\b/],
  ['Matcha cafés', /\bmatcha\b/], ['Bookshops', /\b(bookshop|bookstore)\b/],
  ['Live music', /\b(live music|jazz)\b/], ['Art galleries', /\b(art gallery|art galleries)\b/],
];
function inferredTags(text: string, rules: [string, RegExp][]): string[] {
  // Ignore negated descriptions and quoted instruction-like text. A caption is data.
  const sentences = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/#/g, ' ').split(/[.!?;\n]/);
  return rules.flatMap(([tag, pattern]) => sentences.some(sentence => {
    const match = pattern.exec(sentence);
    return match && !/\b(not|never|no|isnt|isn't|isn’t|wasnt|wasn't|without)\b/.test(sentence.slice(Math.max(0, match.index - 35), match.index));
  }) ? [tag] : []);
}
export function inferSocialContext(venue: MediaVenue, posts: readonly VenueMedia[]): SocialContext {
  const key = mediaVenueKey(venue);
  const sources = [...new Map(posts.filter(post => publicMedia(post.url) && post.venueKey === key &&
    ['official-oembed', 'source-excerpt'].includes(post.metadataSource || '') && post.caption)
    .map(post => [post.url, { url: post.url, caption: post.caption!.slice(0, 600), metadataSource: post.metadataSource! }])).values()].slice(0, 8);
  return { venueKey: key, inferred: true, sources,
    atmosphere: [...new Set(sources.flatMap(source => inferredTags(source.caption, atmosphereRules)))],
    interests: [...new Set(sources.flatMap(source => inferredTags(source.caption, interestRules)))],
  };
}
export function socialFit(venue: MediaVenue, context: SocialContext | undefined, intent: { atmosphere?: string[]; interests?: string[] }): number {
  if (!context || context.venueKey !== mediaVenueKey(venue) || !context.sources?.length || context.inferred !== true) return 0;
  // Bounded to six points. Counts, likes and repeat posts never increase this boost.
  const requested = [...(intent.atmosphere || []), ...(intent.interests || [])];
  const tags = [...context.atmosphere, ...context.interests];
  return requested.length ? 6 * requested.filter(tag => tags.includes(tag)).length / requested.length : 0;
}

/** Shared mobile/web client. Coalesced requests survive an individual viewer leaving. */
export function createVenueMediaClient(origin: string, fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { posts: VenueMedia[]; expires: number }>();
  const pending = new Map<string, Promise<VenueMedia[]>>();
  async function load(venue: MediaVenue): Promise<VenueMedia[]> {
    const signal = AbortSignal.timeout(40000);
    const status = await fetcher(`${origin}/api/status`, { signal: AbortSignal.timeout(5000) });
    if (!status.ok) throw new Error('Post search is unavailable right now.');
    if ((await status.json()).socialDiscovery !== 'openai') return [];
    const response = await fetcher(`${origin}/api/social/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venue: { name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng } }), signal,
    });
    if (!response.ok) throw new Error('Post search is unavailable right now.');
    const data = await response.json();
    const key = mediaVenueKey(venue);
    return (Array.isArray(data.posts) ? data.posts : []).flatMap((post: VenueMedia) => {
      const canonical = publicMedia(post?.url);
      if (!canonical || post.venueKey !== key) return [];
      return [{ ...canonical, caption: typeof post.caption === 'string' ? post.caption.slice(0, 600) : '',
        creator: typeof post.creator === 'string' ? post.creator.slice(0, 80) : '',
        thumbnail: safeThumbnail(post.thumbnail),
        venueKey: post.venueKey, metadataSource: post.metadataSource, locationEvidence: post.locationEvidence }];
    }).slice(0, 8);
  }
  return {
    async preview(value: string): Promise<VenueMedia> {
      const canonical = publicMedia(value);
      if (!canonical) throw new Error('Use a TikTok video or Instagram post link.');
      try {
        const response = await fetcher(`${origin}/api/social/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: canonical.url }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) return canonical;
        const { post } = await response.json();
        return { ...canonical, caption: typeof post?.caption === 'string' ? post.caption.slice(0, 600) : '',
          creator: typeof post?.creator === 'string' ? post.creator.slice(0, 80) : '', thumbnail: safeThumbnail(post?.thumbnail) };
      } catch { return canonical; }
    },
    peek: (venue: MediaVenue) => { const hit = cache.get(mediaVenueKey(venue)); return hit && hit.expires > now() ? hit.posts : []; },
    async discover(venue: MediaVenue, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const key = mediaVenueKey(venue), hit = cache.get(key);
      let work = hit && hit.expires > now() ? Promise.resolve(hit.posts) : pending.get(key);
      if (!work) {
        work = load(venue).then(posts => {
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(key, { posts, expires: now() + (posts.length ? 6 * 3600000 : 15 * 60000) });
          return posts;
        }).finally(() => pending.delete(key));
        pending.set(key, work);
      }
      if (!signal) return work;
      return new Promise<VenueMedia[]>((resolve, reject) => {
        const abort = () => reject(signal.reason || new Error('Aborted'));
        signal.addEventListener('abort', abort, { once: true });
        work!.then(posts => { signal.removeEventListener('abort', abort); if (!signal.aborted) resolve(posts); }, error => {
          signal.removeEventListener('abort', abort); reject(error);
        });
      });
    },
  };
}
