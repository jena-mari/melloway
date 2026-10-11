import { parseSocialMediaUrl, type SocialMediaUrl } from './socialMediaUrl.ts';

export interface DiscoveryCafe {
  venueId: string;
  name: string;
  /** The caller supplies the café's Sydney suburb. */
  suburb: string;
}

/** Direct video search results. Text is supplied evidence, not generated copy. */
export interface SocialSearchSource {
  url: string;
  title?: string;
  snippet?: string;
}

export interface MockSocialSearchProvider {
  mode: 'mock';
  search(cafe: DiscoveryCafe): Promise<readonly SocialSearchSource[]>;
}

export interface DiscoveryCandidate {
  venueId: string;
  platform: SocialMediaUrl['platform'];
  postId: string;
  normalizedUrl: string;
  sourceUrl: string;
  matchExplanation: string;
  uncertainty: string;
  discoveredAt: string;
  status: 'pending';
}

function normalizeText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function mentions(text: string, phrase: string): boolean {
  const escaped = normalizeText(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u')
    .test(normalizeText(text));
}

/** Mock-only, framework-independent pipeline: no HTTP, storage or fallback data. */
export async function discoverSocialVideos(
  cafe: DiscoveryCafe,
  provider: MockSocialSearchProvider,
  now: () => Date = () => new Date(),
): Promise<DiscoveryCandidate[]> {
  if (!cafe || [cafe.venueId, cafe.name, cafe.suburb].some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Supply a café venue ID, exact name and Sydney suburb.');
  }
  if (provider.mode !== 'mock') throw new Error('This discovery chunk supports mock search only.');

  const venue = { venueId: cafe.venueId.trim(), name: cafe.name.trim(), suburb: cafe.suburb.trim() };
  const sources = await provider.search({ ...venue });
  if (!Array.isArray(sources)) throw new Error('Mock search must return a list of sources.');
  const discoveredAt = now().toISOString();
  const candidates: DiscoveryCandidate[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source) continue;
    const video = parseSocialMediaUrl(source.url);
    if (!video) continue;
    const evidence = [source.title, source.snippet].filter(value => typeof value === 'string').join(' ').trim();
    if (!mentions(evidence, venue.name) || !mentions(evidence, venue.suburb)) continue;

    const identity = JSON.stringify([venue.venueId, video.platform, video.id]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    candidates.push({
      venueId: venue.venueId,
      platform: video.platform,
      postId: video.id,
      normalizedUrl: video.normalizedUrl,
      sourceUrl: source.url,
      matchExplanation: `Search text mentions "${venue.name}" and "${venue.suburb}": ${evidence}`,
      uncertainty: 'Search text only; venue identity, location and video content have not been verified.',
      discoveredAt,
      status: 'pending',
    });
    if (candidates.length === 5) break;
  }
  return candidates;
}
