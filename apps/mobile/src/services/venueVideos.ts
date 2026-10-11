import { parseSocialMediaUrl, venues, type SocialMediaUrl } from '@melloway/domain';
import { createStore } from 'zustand/vanilla';

export interface VenueVideo {
  venueId: string;
  platform: SocialMediaUrl['platform'];
  postId: string;
  normalizedUrl: string;
  savedAt: string;
}
interface VideoStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export const VENUE_VIDEOS_KEY = 'melloway.venue-videos.v1';
const demoIds = new Set(venues.filter(venue => venue.source === 'demo').map(venue => venue.id));
function requireVenue(venueId: unknown): asserts venueId is string {
  if (typeof venueId !== 'string' || !demoIds.has(venueId)) throw new Error('Unknown demo venue.');
}
export function videosForVenue(videos: VenueVideo[], venueId: string): VenueVideo[] {
  requireVenue(venueId);
  return videos.filter(video => video.venueId === venueId);
}
const identity = (video: VenueVideo) => JSON.stringify([video.venueId, video.platform, video.postId]);
function restore(raw: string | null): VenueVideo[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Invalid saved videos.');
  const seen = new Set<string>();
  return data.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid saved video.');
    const record = value as Partial<VenueVideo>;
    requireVenue(record.venueId);
    const parsed = parseSocialMediaUrl(record.normalizedUrl);
    if (!parsed || parsed.platform !== record.platform || parsed.id !== record.postId
      || parsed.normalizedUrl !== record.normalizedUrl || typeof record.savedAt !== 'string'
      || !Number.isFinite(Date.parse(record.savedAt))) throw new Error('Invalid saved video.');
    const video: VenueVideo = { venueId: record.venueId, platform: parsed.platform, postId: parsed.id,
      normalizedUrl: parsed.normalizedUrl, savedAt: record.savedAt };
    const key = identity(video);
    if (seen.has(key)) throw new Error('Duplicate saved video.');
    seen.add(key);
    return video;
  });
}
export interface VenueVideoState {
  videos: VenueVideo[];
  hydrated: boolean;
  loadError: string;
  load(): Promise<void>;
  add(venueId: unknown, url: unknown, confirmed: boolean): Promise<VenueVideo>;
}

/** Independent device-local data. A failed read/write never overwrites plans or claims a save succeeded. */
export function createVenueVideoStore(storage: VideoStorage, now: () => Date = () => new Date()) {
  let reading: Promise<void> | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  return createStore<VenueVideoState>((set, get) => ({
    videos: [], hydrated: false, loadError: '',
    load() {
      if (get().hydrated) return Promise.resolve();
      if (!reading) reading = (async () => {
        try {
          const videos = restore(await storage.getItem(VENUE_VIDEOS_KEY));
          set({ videos, hydrated: true, loadError: '' });
        } catch {
          const message = 'Could not restore videos on this device. Nothing was overwritten. Try again.';
          set({ loadError: message });
          throw new Error(message);
        } finally { reading = undefined; }
      })();
      return reading;
    },
    async add(venueId, url, confirmed) {
      requireVenue(venueId);
      const parsed = parseSocialMediaUrl(url);
      if (!parsed) throw new Error('Paste a full TikTok video or Instagram Reel link.');
      if (confirmed !== true) throw new Error('Confirm this video features this place before saving.');
      // Serialize writes, including rapid duplicate submissions, so associations are not lost.
      const result = writes.then(async () => {
        await get().load();
        const video: VenueVideo = { venueId, platform: parsed.platform, postId: parsed.id,
          normalizedUrl: parsed.normalizedUrl, savedAt: now().toISOString() };
        if (get().videos.some(existing => identity(existing) === identity(video))) {
          throw new Error('This video is already saved for this venue.');
        }
        const videos = [...get().videos, video];
        try { await storage.setItem(VENUE_VIDEOS_KEY, JSON.stringify(videos)); }
        catch { throw new Error('Could not save the video on this device. Try again.'); }
        set({ videos });
        return video;
      });
      writes = result.catch(() => undefined);
      return result;
    },
  }));
}
