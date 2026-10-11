// Query labels are not evidence that a business offers a visitor activity.
const serviceTypes = new Set(['photography_service', 'photography_studio', 'photographer', 'photo_restoration_service', 'photo_lab', 'event_planner',
  'wedding_planner', 'consultant', 'insurance_agency', 'real_estate_agency', 'travel_agency',
  'car_repair', 'car_rental', 'moving_company', 'storage', 'accounting', 'lawyer']);
export function unrelatedServiceBusiness(venue) {
  return venue.pureServiceAreaBusiness === true || venue.visitMode === 'event-service' ||
    venue.providerTypes?.some(type => serviceTypes.has(type)) ||
    /\b(?:photography|photo (?:restoration|restoring|repair|printing|studio|services?)|portrait studio|photographers?|event hire|venue hire|equipment hire|booth (?:hire|rental)|wedding photography)\b/i.test(venue.name || '');
}

const typesForTag = {
  'Coffee shops': ['cafe', 'coffee_shop'], 'Café food': ['cafe', 'coffee_shop'],
  Brunch: ['cafe', 'restaurant', 'breakfast_restaurant', 'brunch_restaurant'],
  'Matcha cafés': ['cafe', 'coffee_shop', 'tea_house'],
  Bookshops: ['book_store'], Shopping: ['store', 'shopping_mall', 'clothing_store'],
  Thrifting: ['thrift_store', 'used_goods_store'], 'Vintage stores': ['thrift_store', 'used_goods_store', 'clothing_store'],
  'Flea markets': ['market'], 'Art galleries': ['art_gallery'], Museums: ['museum'],
  'Scenic walks': ['park', 'garden', 'hiking_area', 'tourist_attraction'],
  'Photo spots': ['park', 'garden', 'tourist_attraction', 'historical_landmark', 'observation_deck'],
  Picnics: ['park', 'garden'], Beaches: ['beach'],
  Dinner: ['restaurant'], 'Asian food': ['restaurant'], 'Italian food': ['italian_restaurant', 'restaurant'],
  'Street food': ['restaurant', 'market', 'food_court'], 'Fine dining': ['fine_dining_restaurant', 'restaurant'],
  'Cocktail bars': ['bar'], Speakeasies: ['bar'], 'Jazz bars': ['bar', 'live_music_venue'],
  'Live music': ['live_music_venue', 'concert_hall', 'bar'],
  Desserts: ['dessert_shop', 'ice_cream_shop', 'bakery', 'cafe'],
  Arcades: ['video_arcade', 'amusement_center'], 'Escape rooms': ['escape_room', 'amusement_center'],
};
export function providerMatchesTag(venue, tag) {
  if (unrelatedServiceBusiness(venue)) return false;
  if (tag === 'Photo booths') return /\b(?:photo\s?booth|self[- ]service photo|self[- ]portrait)\b/i.test(venue.name || '');
  const expected = typesForTag[tag];
  if (!expected || !venue.providerTypes?.some(type => expected.includes(type))) return false;
  // Specialty tags need a matching identity; a generic café/store is not proof.
  if (tag === 'Matcha cafés') return /\bmatcha\b/i.test(venue.name || '');
  if (tag === 'Vintage stores' && !venue.providerTypes.some(type => ['thrift_store', 'used_goods_store'].includes(type)))
    return /\bvintage\b/i.test(venue.name || '');
  return true;
}

export function touristLandmark(venue) {
  return /\b(?:sydney opera house|harbour bridge|royal botanic garden|darling harbour|art gallery of new south wales|museum of contemporary art|sydney tower|observatory hill|mrs macquarie.s chair)\b/i.test(venue.name || '') ||
    venue.providerTypes?.some(type => ['historical_landmark', 'observation_deck'].includes(type)) || false;
}
