import { createVenueMediaClient, inferSocialContext, type Venue } from '@melloway/domain';
import { mobileConfig } from './config.ts';
const config = mobileConfig();
export const venueMediaClient = createVenueMediaClient(config.apiUrl || '');
export const cachedVenueContext = (venue: Venue) => inferSocialContext(venue, venueMediaClient.peek(venue));
