import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from 'zustand';
import { createVenueVideoStore, type VenueVideoState } from '../services/venueVideos';

const venueVideoStore = createVenueVideoStore(AsyncStorage);
export function useVenueVideoStore<T>(selector: (state: VenueVideoState) => T): T {
  return useStore(venueVideoStore, selector);
}
