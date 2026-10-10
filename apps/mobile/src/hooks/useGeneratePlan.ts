import { useMutation } from '@tanstack/react-query';
import type { Itinerary, Preferences } from '@melloway/domain';
import { generate } from '../services/discovery';

export function useGeneratePlan() {
  return useMutation({
    mutationFn: ({ prefs, seed = 0, previous, onStage }: {
      prefs: Preferences; seed?: number; previous?: Itinerary | null; onStage?: (stage: string) => void;
    }) => generate(prefs, seed, previous, onStage),
    retry: false,
  });
}
