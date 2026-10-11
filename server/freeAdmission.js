// Reviewed admission evidence only. A park name or Google category cannot prove
// free entry. These records do not supply coordinates, hours, ratings or rentals.
const records = [
  {
    names: ['sydney park skate park', 'sydney park skatepark'],
    // Council lists the skatepark as Erskineville and the wider park as
    // Alexandria; older council documents use St Peters for the same site.
    address: /\b(?:st peters|erskineville|alexandria)\b/i,
    street: /\bsydney park (?:road|rd)\b/i,
    url: 'https://www.sydney.com/uk/articles/free-things-to-do-in-sydney-with-kids',
    checkedAt: '2026-10-12',
  },
  {
    names: ['five dock skate park', 'five dock skatepark'],
    address: /\bfive dock\b/i,
    street: /\b(?:first|ingham) (?:avenue|ave)\b/i,
    url: 'https://www.canadabay.nsw.gov.au/lifestyle/sports-and-recreation/sports-club-and-activities/five-dock-skate-park',
    checkedAt: '2026-10-12',
  },
];
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function freeAdmissionEvidence(place, reviewed = records) {
  const name = normalize(place.displayName?.text);
  const address = normalize(place.formattedAddress);
  const record = reviewed.find(record => record.names.includes(name) &&
    record.address.test(address) && record.street.test(address) && /\bnsw\b/.test(address));
  return record ? { url: record.url, checkedAt: record.checkedAt, fields: ['free admission'] } : null;
}
