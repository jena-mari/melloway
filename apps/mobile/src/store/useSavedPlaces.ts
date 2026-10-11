import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { mediaVenueKey, type Venue } from '@melloway/domain';

const key = 'melloway.mobile.places.v1';
let queue: Promise<void> = Promise.resolve();
let loading: Promise<void> | undefined;
export const useSavedPlaces = create<{ places: Venue[]; loaded: boolean; error: string;
  load: () => Promise<void>; toggle: (venue: Venue) => Promise<void> }>((set, get) => ({
  places: [], loaded: false, error: '',
  async load() {
    if (get().loaded) return;
    if (loading) return loading;
    loading = (async () => { try {
      const value = JSON.parse(await AsyncStorage.getItem(key) || '[]');
      if (!Array.isArray(value)) throw new Error('Invalid saved places');
      const places = value.filter(v => v && typeof v.id === 'string' && typeof v.name === 'string' &&
        typeof v.address === 'string' && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Array.isArray(v.tags)).slice(0, 100);
      set({ places, loaded: true, error: '' });
    } catch { set({ loaded: false, error: 'Couldn’t load saved places. Retry before saving.' }); }
    })().finally(() => { loading = undefined; });
    return loading;
  },
  toggle(venue) {
    const work = queue.then(async () => {
      if (!get().loaded) throw new Error('Wait for saved places to load.');
      const current = get().places, identity = mediaVenueKey(venue);
      const kept = current.some(v => v.id === venue.id || mediaVenueKey(v) === identity);
      if (!kept && current.length >= 100) throw new Error('Up to 100 saved places. Remove one first.');
      const { arrivalOverride, visitOverride, ...place } = venue;
      const places = kept ? current.filter(v => v.id !== venue.id && mediaVenueKey(v) !== identity) : [place, ...current];
      await AsyncStorage.setItem(key, JSON.stringify(places));
      set({ places });
    });
    queue = work.catch(() => {});
    return work;
  },
}));
