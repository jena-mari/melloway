import { generateItinerary, validatePreferences, type Itinerary, type Preferences } from '@melloway/domain';
import { randomUUID } from 'expo-crypto';
import { mobileConfig } from './config';
import { createGoogleProvider } from './api';

export async function generate(prefs: Preferences, seed = 0, previous?: Itinerary | null, onStage?: (stage: string) => void) {
  const error = validatePreferences(prefs);
  if (error) throw new Error(error);
  const config = mobileConfig();
  return generateItinerary(prefs, {
    createId: randomUUID, seed, previous, onStage,
    provider: config.mode === 'live' ? createGoogleProvider(config.apiUrl!) : undefined,
  });
}
