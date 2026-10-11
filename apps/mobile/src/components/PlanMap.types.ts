import type { Venue, Preferences } from '@melloway/domain';
export interface PlanMapProps {
  stops: Venue[];
  onSelectVenue: (id: string) => void;
  selectedId?: string;
  prefs?: Preferences;
}
