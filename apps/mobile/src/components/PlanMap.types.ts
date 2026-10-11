import type { Venue } from '@melloway/domain';
export interface PlanMapProps {
  stops: Venue[];
  onSelectVenue: (id: string) => void;
}
