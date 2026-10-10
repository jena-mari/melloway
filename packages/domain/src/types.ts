export interface Coordinates { lat: number; lng: number }
export interface Area extends Coordinates { r: number }
export type Transport = 'Walking' | 'Public transport' | 'Driving';
export interface Preferences {
  mode: 'date' | 'hangout';
  name: string;
  age: number;
  gender: string;
  companion: string;
  partner: string;
  area: string;
  budget: number;
  date: string;
  time: string;
  transport: Transport;
  duration: number;
  preferences: string[];
}
export interface OpeningWindow { open: number; close: number }
export interface Venue extends Coordinates {
  id: string;
  name: string;
  area: string;
  address: string;
  cost: number;
  mins: number;
  tags: string[];
  category: string;
  note: string;
  source: 'demo' | 'google';
  slot?: string;
  hours?: OpeningWindow;
  weeklyHours?: OpeningWindow[][];
  image?: string;
  rating?: number;
  attribution?: string;
  mapsUri?: string;
}
export interface Candidate extends Venue { score: number }
export interface TravelEdge {
  minutes: number;
  /** Geographic km in demo mode; route km for Google edges. */
  distance: number;
  source: 'estimate' | 'google';
}
export type TravelMatrix = TravelEdge[][];
export interface ScheduledStop extends Venue {
  arrival: number;
  travelFromPrevious: TravelEdge | null;
}
export interface Plan {
  stops: ScheduledStop[];
  cost: number;
  transportAllowance: number;
  travel: number;
  elapsed: number;
  distance: number;
  source: 'estimate' | 'google';
}
export interface Itinerary extends Plan {
  id: string;
  prefs: Preferences;
  notice: string;
  createdAt: string;
}
export interface GenerationBundle {
  plan: Itinerary | null;
  candidates: Candidate[];
  matrix: TravelMatrix;
  notice: string;
}
// Existing Node API contracts. Provider implementations live outside the domain.
export interface VenueRequest { prefs: Preferences }
export interface VenueResponse { venues: Venue[] }
export interface MatrixRequest extends VenueRequest { venues: Venue[] }
// JSON encodes Infinity as null for unavailable Google edges.
export interface MatrixResponse {
  matrix: (Omit<TravelEdge, 'minutes'> & { minutes: number | null })[][];
}
export interface DiscoveryProvider {
  venues(prefs: Preferences): Promise<Venue[]>;
  matrix(venues: Venue[], prefs: Preferences): Promise<TravelMatrix>;
}
